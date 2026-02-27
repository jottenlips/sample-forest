import AVFoundation

class AudioBufferPool {
  private var buffers: [String: AVAudioPCMBuffer] = [:]
  private let queue = DispatchQueue(label: "com.sampleforest.bufferpool", attributes: .concurrent)

  /// Load an audio file into a PCM buffer, converting to the standard processing format.
  func load(sampleId: String, uri: String) throws {
    let url = resolveURL(uri)
    let file = try AVAudioFile(forReading: url)

    // Standard processing format: 44.1kHz, Float32, mono or stereo matching source
    let processingFormat = AVAudioFormat(
      commonFormat: .pcmFormatFloat32,
      sampleRate: 44100,
      channels: file.processingFormat.channelCount,
      interleaved: false
    )!

    let frameCount = AVAudioFrameCount(
      Double(file.length) * 44100.0 / file.fileFormat.sampleRate
    )
    guard let buffer = AVAudioPCMBuffer(pcmFormat: processingFormat, frameCapacity: frameCount) else {
      throw NSError(domain: "AudioBufferPool", code: 1, userInfo: [NSLocalizedDescriptionKey: "Failed to create buffer"])
    }

    // If formats differ, use a converter
    if file.processingFormat.sampleRate != 44100 || file.processingFormat.commonFormat != .pcmFormatFloat32 {
      let converter = AVAudioConverter(from: file.processingFormat, to: processingFormat)!
      let sourceBuffer = AVAudioPCMBuffer(
        pcmFormat: file.processingFormat,
        frameCapacity: AVAudioFrameCount(file.length)
      )!
      try file.read(into: sourceBuffer)

      var error: NSError?
      converter.convert(to: buffer, error: &error) { _, outStatus in
        outStatus.pointee = .haveData
        return sourceBuffer
      }
      if let error = error {
        throw error
      }
    } else {
      try file.read(into: buffer)
    }

    queue.async(flags: .barrier) {
      self.buffers[sampleId] = buffer
    }
  }

  /// Get a buffer by sample ID (thread-safe read).
  func get(sampleId: String) -> AVAudioPCMBuffer? {
    var result: AVAudioPCMBuffer?
    queue.sync {
      result = self.buffers[sampleId]
    }
    return result
  }

  /// Remove a buffer.
  func unload(sampleId: String) {
    queue.async(flags: .barrier) {
      self.buffers.removeValue(forKey: sampleId)
    }
  }

  /// Remove all buffers.
  func unloadAll() {
    queue.async(flags: .barrier) {
      self.buffers.removeAll()
    }
  }

  private func resolveURL(_ uri: String) -> URL {
    if uri.hasPrefix("file://") {
      return URL(string: uri)!
    }
    return URL(fileURLWithPath: uri)
  }
}
