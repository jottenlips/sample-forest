import AVFoundation
import Accelerate

class SynthEngine {
  private let sampleRate: Double = 44100

  func synthesize(params: [String: Any]) throws -> [String: Any] {
    let layers = params["layers"] as? [[String: Any]] ?? []
    let noise = params["noise"] as? Double ?? 0
    let durationMs = params["durationMs"] as? Double ?? 500
    let attackMs = params["attackMs"] as? Double ?? 10
    let decayMs = params["decayMs"] as? Double ?? 100
    let volume = params["volume"] as? Double ?? 0.8
    let lfoDict = params["lfo"] as? [String: Any]

    let numSamples = Int((durationMs / 1000.0) * sampleRate)
    guard numSamples > 0 else {
      throw NSError(domain: "SynthEngine", code: 1, userInfo: [NSLocalizedDescriptionKey: "Invalid duration"])
    }

    var mixed = [Float](repeating: 0, count: numSamples)

    // Parse LFO
    var lfoRate: Double = 0
    var lfoDepth: Double = 0
    var lfoWaveform: String = "sine"
    var lfoTarget: String = "volume"
    if let lfo = lfoDict {
      lfoRate = lfo["rate"] as? Double ?? 0
      lfoDepth = lfo["depth"] as? Double ?? 0
      lfoWaveform = lfo["waveform"] as? String ?? "sine"
      lfoTarget = lfo["target"] as? String ?? "volume"
    }

    // Pre-compute LFO values
    var lfoValues = [Float](repeating: 0, count: numSamples)
    if lfoDict != nil && lfoDepth > 0 {
      for i in 0..<numSamples {
        let t = Double(i) / sampleRate
        let phase = (lfoRate * t).truncatingRemainder(dividingBy: 1.0)
        lfoValues[i] = Float(computeWaveform(waveform: lfoWaveform, phase: phase))
      }
    }

    // Generate each layer
    let sourceCount = layers.count + (noise > 0 ? 1 : 0)
    let norm = Float(max(sourceCount, 1))

    for layer in layers {
      let waveform = layer["waveform"] as? String ?? "sine"
      let frequency = layer["frequency"] as? Double ?? 440
      let layerVolume = Float(layer["volume"] as? Double ?? 1.0)

      for i in 0..<numSamples {
        let t = Double(i) / sampleRate
        var freq = frequency

        // Pitch LFO modulation
        if lfoDict != nil && lfoTarget == "pitch" && lfoDepth > 0 {
          freq = frequency * (1.0 + Double(lfoValues[i]) * lfoDepth * 0.1)
        }

        let phase = (freq * t).truncatingRemainder(dividingBy: 1.0)
        let value = Float(computeWaveform(waveform: waveform, phase: phase))
        mixed[i] += value * layerVolume
      }
    }

    // White noise
    if noise > 0 {
      let noiseLevel = Float(noise)
      for i in 0..<numSamples {
        mixed[i] += (Float.random(in: -1...1)) * noiseLevel
      }
    }

    // Volume LFO (tremolo)
    if lfoDict != nil && lfoTarget == "volume" && lfoDepth > 0 {
      let depth = Float(lfoDepth)
      for i in 0..<numSamples {
        mixed[i] *= (1.0 - depth) + depth * (lfoValues[i] * 0.5 + 0.5)
      }
    }

    // Normalize by source count
    if norm > 1 {
      var normVal = norm
      vDSP_vsdiv(mixed, 1, &normVal, &mixed, 1, vDSP_Length(numSamples))
    }

    // AD envelope
    let attackSamples = Int((attackMs / 1000.0) * sampleRate)
    let decaySamples = Int((decayMs / 1000.0) * sampleRate)
    let decayStart = numSamples - decaySamples

    var envelope = [Float](repeating: 1.0, count: numSamples)
    for i in 0..<numSamples {
      if i < attackSamples && attackSamples > 0 {
        envelope[i] = Float(i) / Float(attackSamples)
      } else if i >= decayStart && decaySamples > 0 {
        envelope[i] = Float(numSamples - i) / Float(decaySamples)
      }
    }

    // Apply envelope and master volume
    vDSP_vmul(mixed, 1, envelope, 1, &mixed, 1, vDSP_Length(numSamples))
    var vol = Float(volume)
    vDSP_vsmul(mixed, 1, &vol, &mixed, 1, vDSP_Length(numSamples))

    // Encode as WAV
    let wavData = encodeWAV(samples: mixed, sampleRate: Int(sampleRate))

    // Write to Documents/samples/
    let documentsURL = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
    let samplesDir = documentsURL.appendingPathComponent("samples")
    try FileManager.default.createDirectory(at: samplesDir, withIntermediateDirectories: true)
    let fileName = "synth_\(Int(Date().timeIntervalSince1970 * 1000)).wav"
    let destURL = samplesDir.appendingPathComponent(fileName)
    try wavData.write(to: destURL)

    // Generate 50-point waveform
    let waveformData = downsampleWaveform(samples: mixed, points: 50)

    return [
      "uri": destURL.absoluteString,
      "durationMs": durationMs,
      "waveformData": waveformData,
    ]
  }

  private func computeWaveform(waveform: String, phase: Double) -> Double {
    switch waveform {
    case "sine":
      return sin(2.0 * .pi * phase)
    case "square":
      return phase < 0.5 ? 1.0 : -1.0
    case "saw":
      return 2.0 * phase - 1.0
    case "triangle":
      return phase < 0.5 ? 4.0 * phase - 1.0 : 3.0 - 4.0 * phase
    default:
      return sin(2.0 * .pi * phase)
    }
  }

  private func downsampleWaveform(samples: [Float], points: Int) -> [Double] {
    let chunkSize = max(1, samples.count / points)
    var waveform: [Double] = []
    for i in 0..<points {
      let start = i * chunkSize
      let end = min(start + chunkSize, samples.count)
      var maxAbs: Float = 0
      for j in start..<end {
        let abs = Swift.abs(samples[j])
        if abs > maxAbs { maxAbs = abs }
      }
      waveform.append(Double(max(0.05, maxAbs)))
    }
    return waveform
  }

  private func encodeWAV(samples: [Float], sampleRate: Int) -> Data {
    let numChannels: Int = 1
    let bitsPerSample: Int = 16
    let bytesPerSample = bitsPerSample / 8
    let dataSize = samples.count * bytesPerSample
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
      ptr.storeBytes(of: UInt32(sampleRate * numChannels * bytesPerSample).littleEndian, toByteOffset: 28, as: UInt32.self)
      ptr.storeBytes(of: UInt16(numChannels * bytesPerSample).littleEndian, toByteOffset: 32, as: UInt16.self)
      ptr.storeBytes(of: UInt16(bitsPerSample).littleEndian, toByteOffset: 34, as: UInt16.self)

      // data chunk
      "data".utf8.enumerated().forEach { ptr.storeBytes(of: $0.element, toByteOffset: 36 + $0.offset, as: UInt8.self) }
      ptr.storeBytes(of: UInt32(dataSize).littleEndian, toByteOffset: 40, as: UInt32.self)

      // PCM data
      var offset = headerSize
      for sample in samples {
        let clamped = max(-1.0, min(1.0, sample))
        let int16: Int16 = clamped < 0 ? Int16(clamped * 32768.0) : Int16(clamped * 32767.0)
        ptr.storeBytes(of: int16.littleEndian, toByteOffset: offset, as: Int16.self)
        offset += 2
      }
    }

    return data
  }
}
