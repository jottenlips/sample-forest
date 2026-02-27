import AVFoundation

class AudioFileProcessor {

  /// Import an audio file: copy to Documents/samples/, extract duration and waveform.
  func importFile(sourceUri: String, fileName: String) throws -> [String: Any] {
    let sourceURL = resolveURL(sourceUri)

    // Ensure samples directory exists
    let documentsURL = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
    let samplesDir = documentsURL.appendingPathComponent("samples")
    try FileManager.default.createDirectory(at: samplesDir, withIntermediateDirectories: true)

    // Copy file
    let destURL = samplesDir.appendingPathComponent("\(Int(Date().timeIntervalSince1970 * 1000))_\(fileName)")
    if FileManager.default.fileExists(atPath: destURL.path) {
      try FileManager.default.removeItem(at: destURL)
    }
    try FileManager.default.copyItem(at: sourceURL, to: destURL)

    // Open with AVAudioFile for accurate metadata
    let audioFile = try AVAudioFile(forReading: destURL)
    let sampleRate = audioFile.fileFormat.sampleRate
    let frameCount = audioFile.length
    let durationMs = Double(frameCount) / sampleRate * 1000.0

    // Extract waveform data (50 points)
    let waveformData = try extractWaveform(from: audioFile, points: 50)

    return [
      "uri": destURL.absoluteString,
      "durationMs": durationMs,
      "waveformData": waveformData,
    ]
  }

  /// Extract waveform data by reading PCM and downsampling to N points.
  private func extractWaveform(from file: AVAudioFile, points: Int) throws -> [Double] {
    let format = AVAudioFormat(
      commonFormat: .pcmFormatFloat32,
      sampleRate: file.fileFormat.sampleRate,
      channels: 1,
      interleaved: false
    )!

    // Reset file position
    file.framePosition = 0

    let totalFrames = AVAudioFrameCount(file.length)
    guard totalFrames > 0 else { return Array(repeating: 0.05, count: points) }

    guard let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: totalFrames) else {
      return Array(repeating: 0.05, count: points)
    }

    // If source is stereo, we need to convert to mono
    if file.processingFormat.channelCount != 1 || file.processingFormat.commonFormat != .pcmFormatFloat32 {
      let converter = AVAudioConverter(from: file.processingFormat, to: format)!
      let sourceBuffer = AVAudioPCMBuffer(
        pcmFormat: file.processingFormat,
        frameCapacity: totalFrames
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

    guard let floatData = buffer.floatChannelData?[0] else {
      return Array(repeating: 0.05, count: points)
    }

    let frameLength = Int(buffer.frameLength)
    let chunkSize = max(1, frameLength / points)
    var waveform: [Double] = []

    for i in 0..<points {
      let start = i * chunkSize
      let end = min(start + chunkSize, frameLength)
      var maxAbs: Float = 0
      for j in start..<end {
        let abs = Swift.abs(floatData[j])
        if abs > maxAbs { maxAbs = abs }
      }
      waveform.append(Double(max(0.05, maxAbs)))
    }

    return waveform
  }

  private func resolveURL(_ uri: String) -> URL {
    if uri.hasPrefix("file://") {
      return URL(string: uri)!
    }
    return URL(fileURLWithPath: uri)
  }
}
