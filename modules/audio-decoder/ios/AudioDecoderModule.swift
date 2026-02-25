import ExpoModulesCore
import AVFoundation

public class AudioDecoderModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AudioDecoder")

    AsyncFunction("decode") { (uri: String, promise: Promise) in
      DispatchQueue.global(qos: .userInitiated).async {
        do {
          let url: URL
          if uri.hasPrefix("file://") {
            url = URL(string: uri)!
          } else {
            url = URL(fileURLWithPath: uri)
          }

          let audioFile = try AVAudioFile(forReading: url)
          let processingFormat = AVAudioFormat(
            commonFormat: .pcmFormatFloat32,
            sampleRate: audioFile.fileFormat.sampleRate,
            channels: audioFile.fileFormat.channelCount,
            interleaved: false
          )!

          let frameCount = AVAudioFrameCount(audioFile.length)
          guard let buffer = AVAudioPCMBuffer(pcmFormat: processingFormat, frameCapacity: frameCount) else {
            promise.reject("ERR_BUFFER", "Failed to create audio buffer")
            return
          }

          try audioFile.read(into: buffer)

          let sampleRate = audioFile.fileFormat.sampleRate
          let channelCount = Int(audioFile.fileFormat.channelCount)
          let frameLength = Int(buffer.frameLength)

          // Convert Float32 PCM data to base64-encoded raw bytes per channel
          var channelsBase64: [String] = []
          for ch in 0..<channelCount {
            guard let channelData = buffer.floatChannelData?[ch] else { continue }
            let data = Data(bytes: channelData, count: frameLength * MemoryLayout<Float>.size)
            channelsBase64.append(data.base64EncodedString())
          }

          promise.resolve([
            "sampleRate": sampleRate,
            "channels": channelCount,
            "frames": frameLength,
            "duration": Double(frameLength) / sampleRate,
            "channelData": channelsBase64,
          ] as [String: Any])
        } catch {
          promise.reject("ERR_DECODE", "Failed to decode audio: \(error.localizedDescription)")
        }
      }
    }
  }
}
