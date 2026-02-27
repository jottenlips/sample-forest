import AVFoundation

/// Renders song scenes offline to a stereo WAV file.
class OfflineRenderer {
  private let bufferPool: AudioBufferPool
  private let sampleRate: Double = 44100
  private let numChannels: Int = 2

  init(bufferPool: AudioBufferPool) {
    self.bufferPool = bufferPool
  }

  /// Render a song arrangement to WAV files.
  /// - Parameters:
  ///   - scenes: Array of scene dicts with bpm, stepCount, swing, channelSteps, channelTripletSteps
  ///   - channels: Array of channel dicts with id, sampleId, volume, muted, solo, steps, tripletSteps, trimStartMs, trimEndMs, playbackRate
  ///   - mode: "mix", "stems", or "stem"
  ///   - channelId: Required when mode == "stem"
  /// - Returns: Array of dicts with "label" and "uri" keys
  func render(
    scenes: [[String: Any]],
    channels: [[String: Any]],
    mode: String,
    channelId: Int?
  ) throws -> [[String: Any]] {
    let parsedChannels = parseChannels(channels)
    let parsedScenes = parseScenes(scenes)

    guard !parsedScenes.isEmpty else {
      throw NSError(domain: "OfflineRenderer", code: 1, userInfo: [NSLocalizedDescriptionKey: "No scenes to render"])
    }

    // Calculate total duration
    var totalDuration: Double = 0
    for scene in parsedScenes {
      totalDuration += sceneDuration(scene)
    }
    let tailSeconds: Double = 2
    let totalSamples = Int(ceil((totalDuration + tailSeconds) * sampleRate))

    var results: [[String: Any]] = []

    if mode == "mix" || mode == "stem" {
      let renderChannels: [RenderChannel]
      if mode == "stem", let targetId = channelId {
        renderChannels = parsedChannels.filter { $0.channelId == targetId }
      } else {
        renderChannels = parsedChannels
      }

      let mixBuffer = renderToBuffer(
        scenes: parsedScenes,
        channels: renderChannels,
        allChannels: parsedChannels,
        totalSamples: totalSamples
      )

      let label: String
      if mode == "stem", let _ = channelId {
        label = renderChannels.first.map { "ch\($0.channelId)" } ?? "stem"
      } else {
        label = "mix"
      }

      let uri = try writeWAV(samples: mixBuffer, label: label)
      results.append(["label": label, "uri": uri])
    } else {
      // stems mode — render each channel separately
      let channelsWithSamples = parsedChannels.filter { !$0.sampleId.isEmpty }
      for ch in channelsWithSamples {
        let stemBuffer = renderToBuffer(
          scenes: parsedScenes,
          channels: [ch],
          allChannels: parsedChannels,
          totalSamples: totalSamples
        )
        let label = "ch\(ch.channelId)"
        let uri = try writeWAV(samples: stemBuffer, label: label)
        results.append(["label": label, "uri": uri])
      }
    }

    return results
  }

  // MARK: - Rendering

  private func renderToBuffer(
    scenes: [RenderScene],
    channels: [RenderChannel],
    allChannels: [RenderChannel],
    totalSamples: Int
  ) -> [[Float]] {
    // Stereo buffer: [left, right]
    var output: [[Float]] = [
      [Float](repeating: 0, count: totalSamples),
      [Float](repeating: 0, count: totalSamples),
    ]

    let hasSolo = channels.contains { $0.solo }
    var offset: Double = 0

    for scene in scenes {
      let stepDuration = 60.0 / scene.bpm / 4.0
      let tripletDuration = stepDuration * (2.0 / 3.0)
      let swingAmount = (scene.swing / 100.0) * 0.75
      let tripletStepCount = Int(floor(Double(scene.stepCount) * 3.0 / 2.0))

      for channel in channels {
        guard !channel.muted else { continue }
        if hasSolo && !channel.solo { continue }
        guard !channel.sampleId.isEmpty else { continue }

        guard let srcBuffer = bufferPool.get(sampleId: channel.sampleId) else { continue }

        let volume = channel.volume
        let rate = channel.playbackRate

        // Get steps for this scene (scene-specific or channel default)
        let steps = scene.channelSteps[channel.channelId] ?? channel.steps
        let tripletSteps = scene.channelTripletSteps[channel.channelId] ?? channel.tripletSteps

        // Calculate trim frames
        let srcSampleRate = srcBuffer.format.sampleRate
        let trimStartFrame = Int(channel.trimStartMs / 1000.0 * srcSampleRate)
        let totalFrames = Int(srcBuffer.frameLength)
        let trimEndFrame: Int
        if channel.trimEndMs > 0 {
          trimEndFrame = min(Int(channel.trimEndMs / 1000.0 * srcSampleRate), totalFrames)
        } else {
          trimEndFrame = totalFrames
        }
        let startFrame = min(trimStartFrame, totalFrames)
        let frameCount = trimEndFrame > startFrame ? trimEndFrame - startFrame : totalFrames

        // Normal steps
        for i in 0..<scene.stepCount {
          guard i < steps.count, steps[i] else { continue }
          let isOffbeat = i % 2 == 1
          let swingDelay = isOffbeat ? swingAmount * stepDuration : 0
          let time = offset + Double(i) * stepDuration + swingDelay

          mixSample(
            into: &output,
            srcBuffer: srcBuffer,
            startFrame: startFrame,
            frameCount: frameCount,
            atTime: time,
            volume: volume,
            rate: rate
          )
        }

        // Triplet steps
        for i in 0..<tripletStepCount {
          guard i < tripletSteps.count, tripletSteps[i] else { continue }
          let time = offset + Double(i) * tripletDuration

          mixSample(
            into: &output,
            srcBuffer: srcBuffer,
            startFrame: startFrame,
            frameCount: frameCount,
            atTime: time,
            volume: volume,
            rate: rate
          )
        }
      }

      offset += sceneDuration(scene)
    }

    return output
  }

  private func mixSample(
    into output: inout [[Float]],
    srcBuffer: AVAudioPCMBuffer,
    startFrame: Int,
    frameCount: Int,
    atTime time: Double,
    volume: Float,
    rate: Float
  ) {
    let destStartSample = Int(time * sampleRate)
    guard destStartSample >= 0, destStartSample < output[0].count else { return }

    let srcChannelCount = Int(srcBuffer.format.channelCount)
    let srcSampleRate = srcBuffer.format.sampleRate

    guard let floatData = srcBuffer.floatChannelData else { return }

    // Resample if needed (rate != 1.0 or sample rates differ)
    let effectiveRate = Double(rate) * (srcSampleRate / sampleRate)

    let destFrameCount = Int(Double(frameCount) / effectiveRate)
    let endSample = min(destStartSample + destFrameCount, output[0].count)

    for destIdx in destStartSample..<endSample {
      let srcPos = Double(destIdx - destStartSample) * effectiveRate + Double(startFrame)
      let srcIdx = Int(srcPos)
      let frac = Float(srcPos - Double(srcIdx))

      guard srcIdx < Int(srcBuffer.frameLength) else { break }
      let nextIdx = min(srcIdx + 1, Int(srcBuffer.frameLength) - 1)

      // Left channel (or mono)
      let leftSample: Float
      let l0 = floatData[0][srcIdx]
      let l1 = floatData[0][nextIdx]
      leftSample = l0 + (l1 - l0) * frac

      // Right channel
      let rightSample: Float
      if srcChannelCount > 1 {
        let r0 = floatData[1][srcIdx]
        let r1 = floatData[1][nextIdx]
        rightSample = r0 + (r1 - r0) * frac
      } else {
        rightSample = leftSample
      }

      output[0][destIdx] += leftSample * volume
      output[1][destIdx] += rightSample * volume
    }
  }

  // MARK: - WAV Writing

  private func writeWAV(samples: [[Float]], label: String) throws -> String {
    let left = samples[0]
    let right = samples[1]
    let numSamples = left.count
    let bitsPerSample = 16
    let bytesPerSample = bitsPerSample / 8
    let blockAlign = numChannels * bytesPerSample
    let dataSize = numSamples * blockAlign
    let headerSize = 44

    var data = Data(count: headerSize + dataSize)

    data.withUnsafeMutableBytes { rawBuffer in
      let ptr = rawBuffer.baseAddress!

      // RIFF header
      "RIFF".utf8.enumerated().forEach { ptr.storeBytes(of: $0.element, toByteOffset: $0.offset, as: UInt8.self) }
      ptr.storeBytes(of: UInt32(headerSize - 8 + dataSize).littleEndian, toByteOffset: 4, as: UInt32.self)
      "WAVE".utf8.enumerated().forEach { ptr.storeBytes(of: $0.element, toByteOffset: 8 + $0.offset, as: UInt8.self) }

      // fmt chunk
      "fmt ".utf8.enumerated().forEach { ptr.storeBytes(of: $0.element, toByteOffset: 12 + $0.offset, as: UInt8.self) }
      ptr.storeBytes(of: UInt32(16).littleEndian, toByteOffset: 16, as: UInt32.self)
      ptr.storeBytes(of: UInt16(1).littleEndian, toByteOffset: 20, as: UInt16.self) // PCM
      ptr.storeBytes(of: UInt16(numChannels).littleEndian, toByteOffset: 22, as: UInt16.self)
      ptr.storeBytes(of: UInt32(sampleRate).littleEndian, toByteOffset: 24, as: UInt32.self)
      ptr.storeBytes(of: UInt32(Int(sampleRate) * numChannels * bytesPerSample).littleEndian, toByteOffset: 28, as: UInt32.self)
      ptr.storeBytes(of: UInt16(blockAlign).littleEndian, toByteOffset: 32, as: UInt16.self)
      ptr.storeBytes(of: UInt16(bitsPerSample).littleEndian, toByteOffset: 34, as: UInt16.self)

      // data chunk
      "data".utf8.enumerated().forEach { ptr.storeBytes(of: $0.element, toByteOffset: 36 + $0.offset, as: UInt8.self) }
      ptr.storeBytes(of: UInt32(dataSize).littleEndian, toByteOffset: 40, as: UInt32.self)

      // Interleaved stereo PCM data
      var offset = headerSize
      for i in 0..<numSamples {
        // Left
        let lClamped = max(-1.0, min(1.0, left[i]))
        let lInt16: Int16 = lClamped < 0 ? Int16(lClamped * 32768.0) : Int16(lClamped * 32767.0)
        ptr.storeBytes(of: lInt16.littleEndian, toByteOffset: offset, as: Int16.self)
        offset += 2
        // Right
        let rClamped = max(-1.0, min(1.0, right[i]))
        let rInt16: Int16 = rClamped < 0 ? Int16(rClamped * 32768.0) : Int16(rClamped * 32767.0)
        ptr.storeBytes(of: rInt16.littleEndian, toByteOffset: offset, as: Int16.self)
        offset += 2
      }
    }

    // Write to Documents/exports/
    let documentsURL = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
    let exportsDir = documentsURL.appendingPathComponent("exports")
    try FileManager.default.createDirectory(at: exportsDir, withIntermediateDirectories: true)
    let fileName = "\(label)_\(Int(Date().timeIntervalSince1970 * 1000)).wav"
    let destURL = exportsDir.appendingPathComponent(fileName)
    try data.write(to: destURL)

    return destURL.absoluteString
  }

  // MARK: - Helpers

  private func sceneDuration(_ scene: RenderScene) -> Double {
    return Double(scene.stepCount) * (60.0 / scene.bpm / 4.0)
  }

  private func parseChannels(_ dicts: [[String: Any]]) -> [RenderChannel] {
    return dicts.map { ch in
      RenderChannel(
        channelId: ch["channelId"] as? Int ?? 0,
        sampleId: ch["sampleId"] as? String ?? "",
        volume: Float(ch["volume"] as? Double ?? 0.8),
        muted: ch["muted"] as? Bool ?? false,
        solo: ch["solo"] as? Bool ?? false,
        steps: ch["steps"] as? [Bool] ?? [],
        tripletSteps: ch["tripletSteps"] as? [Bool] ?? [],
        trimStartMs: ch["trimStartMs"] as? Double ?? 0,
        trimEndMs: ch["trimEndMs"] as? Double ?? 0,
        playbackRate: Float(ch["playbackRate"] as? Double ?? 1.0)
      )
    }
  }

  private func parseScenes(_ dicts: [[String: Any]]) -> [RenderScene] {
    return dicts.map { s in
      let bpm = s["bpm"] as? Double ?? 120
      let stepCount = s["stepCount"] as? Int ?? 16
      let swing = s["swing"] as? Double ?? 0

      var channelSteps: [Int: [Bool]] = [:]
      if let csDict = s["channelSteps"] as? [String: [Bool]] {
        for (key, val) in csDict {
          if let intKey = Int(key) {
            channelSteps[intKey] = val
          }
        }
      }

      var channelTripletSteps: [Int: [Bool]] = [:]
      if let ctsDict = s["channelTripletSteps"] as? [String: [Bool]] {
        for (key, val) in ctsDict {
          if let intKey = Int(key) {
            channelTripletSteps[intKey] = val
          }
        }
      }

      return RenderScene(
        bpm: bpm,
        stepCount: stepCount,
        swing: swing,
        channelSteps: channelSteps,
        channelTripletSteps: channelTripletSteps
      )
    }
  }
}

// MARK: - Data Models

private struct RenderChannel {
  let channelId: Int
  let sampleId: String
  let volume: Float
  let muted: Bool
  let solo: Bool
  let steps: [Bool]
  let tripletSteps: [Bool]
  let trimStartMs: Double
  let trimEndMs: Double
  let playbackRate: Float
}

private struct RenderScene {
  let bpm: Double
  let stepCount: Int
  let swing: Double
  let channelSteps: [Int: [Bool]]
  let channelTripletSteps: [Int: [Bool]]
}
