import AVFoundation

/// Per-channel audio state: nodes, buffer, pattern, and volumes.
final class ChannelState {
    let id: Int

    // Two player nodes for round-robin retriggering
    var playerNodes: [AVAudioPlayerNode]
    // Per-player mixer to merge multiple players before timePitch
    var playerMixer: AVAudioMixerNode
    var timePitchNode: AVAudioUnitTimePitch
    var mixerNode: AVAudioMixerNode
    var currentPlayerIndex: Int = 0

    // Trimmed PCM buffer ready to schedule (nil until sample loaded)
    var buffer: AVAudioPCMBuffer?

    // Volume
    var sampleVolume: Float = 1.0
    var channelVolume: Float = 1.0

    // Mute/solo
    var muted: Bool = false
    var solo: Bool = false

    // Patterns
    var steps: [Bool] = []
    var tripletSteps: [Bool] = []

    init(id: Int) {
        self.id = id
        self.playerNodes = [AVAudioPlayerNode(), AVAudioPlayerNode()]
        self.playerMixer = AVAudioMixerNode()
        self.timePitchNode = AVAudioUnitTimePitch()
        self.mixerNode = AVAudioMixerNode()
    }

    /// Combined volume: sample × channel
    var effectiveVolume: Float {
        sampleVolume * channelVolume
    }

    /// Get next player node via round-robin
    var nextPlayer: AVAudioPlayerNode {
        let node = playerNodes[currentPlayerIndex]
        currentPlayerIndex = (currentPlayerIndex + 1) % playerNodes.count
        return node
    }

    /// Update the mixer node volume to reflect current effective volume
    func applyVolume() {
        mixerNode.outputVolume = effectiveVolume
    }
}
