import ExpoModulesCore
import AVFoundation

public class AudioEngineModule: Module {
  private let bufferPool = AudioBufferPool()
  private let synthEngine = SynthEngine()
  private let audioFileProcessor = AudioFileProcessor()
  private lazy var offlineRenderer = OfflineRenderer(bufferPool: bufferPool)
  private lazy var sequencerEngine = SequencerEngine(bufferPool: bufferPool) { [weak self] step, tripletStep in
    self?.sendEvent("onStepChange", [
      "currentStep": step,
      "currentTripletStep": tripletStep,
    ])
  }

  public func definition() -> ModuleDefinition {
    Name("AudioEngine")

    Events("onStepChange")

    AsyncFunction("loadSample") { (sampleId: String, uri: String) in
      try self.bufferPool.load(sampleId: sampleId, uri: uri)
    }

    AsyncFunction("unloadSample") { (sampleId: String) in
      self.bufferPool.unload(sampleId: sampleId)
    }

    AsyncFunction("startSequencer") { (config: [String: Any]) in
      let parsed = SequencerConfig.from(dict: config)
      self.sequencerEngine.start(config: parsed)
    }

    AsyncFunction("stopSequencer") { () in
      self.sequencerEngine.stop()
    }

    AsyncFunction("updateSequencerConfig") { (config: [String: Any]) in
      let parsed = SequencerConfig.from(dict: config)
      self.sequencerEngine.updateConfig(parsed)
    }

    AsyncFunction("triggerSample") { (sampleId: String) in
      self.sequencerEngine.triggerOneShot(sampleId: sampleId)
    }

    AsyncFunction("synthesize") { (params: [String: Any]) -> [String: Any] in
      let result = try self.synthEngine.synthesize(params: params)
      return result
    }

    AsyncFunction("importAudioFile") { (sourceUri: String, fileName: String) -> [String: Any] in
      let result = try self.audioFileProcessor.importFile(sourceUri: sourceUri, fileName: fileName)
      return result
    }

    AsyncFunction("exportSong") { (params: [String: Any]) -> [[String: Any]] in
      let scenes = params["scenes"] as? [[String: Any]] ?? []
      let channels = params["channels"] as? [[String: Any]] ?? []
      let mode = params["mode"] as? String ?? "mix"
      let channelId = params["channelId"] as? Int
      return try self.offlineRenderer.render(scenes: scenes, channels: channels, mode: mode, channelId: channelId)
    }
  }
}
