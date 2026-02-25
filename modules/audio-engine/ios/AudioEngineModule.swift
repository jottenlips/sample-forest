import ExpoModulesCore
import AVFoundation

public class AudioEngineModule: Module {
    private lazy var sequencer = SequencerEngine()

    public func definition() -> ModuleDefinition {
        Name("AudioEngine")

        Events("onStepChange")

        OnCreate {
            self.sequencer.onStepChange = { [weak self] step, tripletStep in
                self?.sendEvent("onStepChange", [
                    "step": step,
                    "tripletStep": tripletStep
                ])
            }
        }

        // MARK: - Transport

        Function("play") {
            self.sequencer.play()
        }

        Function("stop") {
            self.sequencer.stop()
        }

        // MARK: - Sequencer params

        Function("updateSequencer") { (bpm: Double, stepCount: Int, swing: Double) in
            self.sequencer.updateSequencer(bpm: bpm, stepCount: stepCount, swing: swing)
        }

        // MARK: - Sample management

        AsyncFunction("loadSample") { (channelId: Int, uri: String, trimStartMs: Double, trimEndMs: Double, playbackRate: Double, volume: Double, preservePitch: Bool) in
            try self.sequencer.loadSample(
                channelId: channelId,
                uri: uri,
                trimStartMs: trimStartMs,
                trimEndMs: trimEndMs,
                playbackRate: Float(playbackRate),
                volume: Float(volume),
                preservePitch: preservePitch
            )
        }

        Function("unloadSample") { (channelId: Int) in
            self.sequencer.unloadSample(channelId: channelId)
        }

        // MARK: - Pattern

        Function("updatePattern") { (channelId: Int, steps: [Bool], tripletSteps: [Bool]) in
            self.sequencer.updatePattern(channelId: channelId, steps: steps, tripletSteps: tripletSteps)
        }

        // MARK: - Channel state

        Function("setChannelMuted") { (id: Int, muted: Bool) in
            self.sequencer.setChannelMuted(id: id, muted: muted)
        }

        Function("setChannelSolo") { (id: Int, solo: Bool) in
            self.sequencer.setChannelSolo(id: id, solo: solo)
        }

        Function("setChannelVolume") { (id: Int, volume: Double) in
            self.sequencer.setChannelVolume(id: id, volume: Float(volume))
        }

        Function("setSampleVolume") { (id: Int, volume: Double) in
            self.sequencer.setSampleVolume(id: id, volume: Float(volume))
        }

        // MARK: - Channel lifecycle

        Function("addChannel") { (channelId: Int) in
            self.sequencer.addChannel(id: channelId)
        }

        Function("removeChannel") { (channelId: Int) in
            self.sequencer.removeChannel(id: channelId)
        }

        // MARK: - Preview

        Function("previewSample") { (channelId: Int) in
            self.sequencer.previewSample(channelId: channelId)
        }
    }
}
