import AVFoundation

/// Core audio engine that handles all scheduling and playback natively.
/// All audio graph management and step scheduling happens here — no JS bridge calls during playback.
final class SequencerEngine {
    // MARK: - Audio engine
    private let engine = AVAudioEngine()

    // Standard processing format — fixed so we don't depend on engine output format before start
    private let processingFormat = AVAudioFormat(standardFormatWithSampleRate: 44100, channels: 2)!

    // MARK: - Channels (keyed by channel ID)
    private var channels: [Int: ChannelState] = [:]

    // MARK: - Sequencer params
    private var bpm: Double = 120
    private var stepCount: Int = 16
    private var swing: Double = 0 // 0-100

    // MARK: - Transport
    private(set) var isPlaying: Bool = false
    private var currentStep: Int = 0
    private var currentTripletStep: Int = 0
    private var playStartHostTime: UInt64 = 0
    private var nextStepHostTime: UInt64 = 0
    private var nextTripletHostTime: UInt64 = 0

    // MARK: - Scheduler
    private var schedulerTimer: DispatchSourceTimer?
    private let schedulerQueue = DispatchQueue(label: "com.sampleforest.sequencer", qos: .userInteractive)
    private let lookaheadSeconds: Double = 0.200 // 200ms lookahead

    // MARK: - Thread safety
    // Heap-allocated so the pointer is stable (os_unfair_lock requires fixed address)
    private let lock: UnsafeMutablePointer<os_unfair_lock> = {
        let ptr = UnsafeMutablePointer<os_unfair_lock>.allocate(capacity: 1)
        ptr.initialize(to: os_unfair_lock())
        return ptr
    }()

    // MARK: - Step callback (for sending events back to JS)
    var onStepChange: ((_ step: Int, _ tripletStep: Int) -> Void)?

    // MARK: - Init

    init() {
        configureAudioSession()
        ensureEngineRunning()
    }

    deinit {
        schedulerTimer?.cancel()
        lock.deinitialize(count: 1)
        lock.deallocate()
    }

    private func configureAudioSession() {
        let session = AVAudioSession.sharedInstance()
        try? session.setCategory(.playback, mode: .default, options: [.mixWithOthers])
        try? session.setPreferredIOBufferDuration(0.005) // 5ms buffer for low latency
        try? session.setActive(true)
    }

    // MARK: - Engine lifecycle

    private func ensureEngineRunning() {
        guard !engine.isRunning else { return }
        do {
            try engine.start()
        } catch {
            print("[SequencerEngine] Failed to start engine: \(error)")
        }
    }

    // MARK: - Channel management

    func addChannel(id: Int) {
        os_unfair_lock_lock(lock)
        guard channels[id] == nil else {
            os_unfair_lock_unlock(lock)
            return
        }

        let channel = ChannelState(id: id)
        channels[id] = channel
        os_unfair_lock_unlock(lock)

        // Engine graph mutations must not be under the spinlock (they can block)
        let format = processingFormat

        for player in channel.playerNodes {
            engine.attach(player)
        }
        engine.attach(channel.playerMixer)
        engine.attach(channel.timePitchNode)
        engine.attach(channel.mixerNode)

        // Wire each player to a separate input bus on playerMixer
        for (i, player) in channel.playerNodes.enumerated() {
            engine.connect(player, to: channel.playerMixer, fromBus: 0, toBus: i, format: format)
        }
        engine.connect(channel.playerMixer, to: channel.timePitchNode, format: format)
        engine.connect(channel.timePitchNode, to: channel.mixerNode, format: format)
        engine.connect(channel.mixerNode, to: engine.mainMixerNode, format: format)

        channel.applyVolume()
        ensureEngineRunning()

        for player in channel.playerNodes {
            player.play()
        }
    }

    func removeChannel(id: Int) {
        os_unfair_lock_lock(lock)
        guard let channel = channels.removeValue(forKey: id) else {
            os_unfair_lock_unlock(lock)
            return
        }
        os_unfair_lock_unlock(lock)

        // Detach outside the lock
        for player in channel.playerNodes {
            player.stop()
            engine.detach(player)
        }
        engine.detach(channel.playerMixer)
        engine.detach(channel.timePitchNode)
        engine.detach(channel.mixerNode)
    }

    // MARK: - Sample loading

    func loadSample(
        channelId: Int,
        uri: String,
        trimStartMs: Double,
        trimEndMs: Double,
        playbackRate: Float,
        volume: Float,
        preservePitch: Bool
    ) throws {
        let url: URL
        if uri.hasPrefix("file://") {
            guard let fileUrl = URL(string: uri) else {
                throw NSError(domain: "AudioEngine", code: 1, userInfo: [NSLocalizedDescriptionKey: "Invalid URI"])
            }
            url = fileUrl
        } else {
            url = URL(fileURLWithPath: uri)
        }

        let audioFile = try AVAudioFile(forReading: url)
        let fileFormat = audioFile.processingFormat

        let totalFrames = AVAudioFrameCount(audioFile.length)
        guard totalFrames > 0 else {
            throw NSError(domain: "AudioEngine", code: 2, userInfo: [NSLocalizedDescriptionKey: "Empty audio file"])
        }

        guard let fullBuffer = AVAudioPCMBuffer(pcmFormat: fileFormat, frameCapacity: totalFrames) else {
            throw NSError(domain: "AudioEngine", code: 3, userInfo: [NSLocalizedDescriptionKey: "Could not allocate buffer"])
        }
        try audioFile.read(into: fullBuffer)

        // Apply trim
        let sampleRate = fileFormat.sampleRate
        let startFrame = AVAudioFramePosition(trimStartMs / 1000.0 * sampleRate)
        let endFrame: AVAudioFramePosition
        if trimEndMs > trimStartMs {
            endFrame = min(AVAudioFramePosition(trimEndMs / 1000.0 * sampleRate), AVAudioFramePosition(totalFrames))
        } else {
            endFrame = AVAudioFramePosition(totalFrames)
        }

        let trimmedFrameCount = AVAudioFrameCount(max(0, endFrame - startFrame))
        let trimmedBuffer: AVAudioPCMBuffer

        if trimmedFrameCount > 0 && (startFrame > 0 || endFrame < AVAudioFramePosition(totalFrames)) {
            guard let tb = AVAudioPCMBuffer(pcmFormat: fileFormat, frameCapacity: trimmedFrameCount) else {
                throw NSError(domain: "AudioEngine", code: 4, userInfo: [NSLocalizedDescriptionKey: "Could not allocate trimmed buffer"])
            }
            tb.frameLength = trimmedFrameCount

            let channelCount = Int(fileFormat.channelCount)
            for ch in 0..<channelCount {
                guard let src = fullBuffer.floatChannelData?[ch],
                      let dst = tb.floatChannelData?[ch] else { continue }
                memcpy(dst, src.advanced(by: Int(startFrame)), Int(trimmedFrameCount) * MemoryLayout<Float>.size)
            }
            trimmedBuffer = tb
        } else {
            trimmedBuffer = fullBuffer
        }

        // Convert to our standard processing format if needed
        let targetFormat = processingFormat
        let finalBuffer: AVAudioPCMBuffer

        if fileFormat.sampleRate != targetFormat.sampleRate || fileFormat.channelCount != targetFormat.channelCount {
            guard let converter = AVAudioConverter(from: fileFormat, to: targetFormat) else {
                applyToChannel(channelId: channelId, buffer: trimmedBuffer, playbackRate: playbackRate, volume: volume, preservePitch: preservePitch)
                return
            }

            let ratio = targetFormat.sampleRate / fileFormat.sampleRate
            let convertedCapacity = AVAudioFrameCount(Double(trimmedBuffer.frameLength) * ratio) + 100
            guard let convertedBuffer = AVAudioPCMBuffer(pcmFormat: targetFormat, frameCapacity: convertedCapacity) else {
                throw NSError(domain: "AudioEngine", code: 5, userInfo: [NSLocalizedDescriptionKey: "Could not allocate conversion buffer"])
            }

            var convError: NSError?
            converter.convert(to: convertedBuffer, error: &convError) { _, outStatus in
                outStatus.pointee = .haveData
                return trimmedBuffer
            }
            if let convError = convError {
                throw convError
            }
            finalBuffer = convertedBuffer
        } else {
            finalBuffer = trimmedBuffer
        }

        applyToChannel(channelId: channelId, buffer: finalBuffer, playbackRate: playbackRate, volume: volume, preservePitch: preservePitch)
    }

    private func applyToChannel(channelId: Int, buffer: AVAudioPCMBuffer, playbackRate: Float, volume: Float, preservePitch: Bool) {
        os_unfair_lock_lock(lock)
        defer { os_unfair_lock_unlock(lock) }

        guard let channel = channels[channelId] else { return }
        channel.buffer = buffer
        channel.sampleVolume = volume

        channel.timePitchNode.rate = playbackRate
        channel.timePitchNode.overlap = 8
        if preservePitch {
            channel.timePitchNode.pitch = 0
        } else {
            let pitchCents = 1200.0 * log2(Double(playbackRate))
            channel.timePitchNode.pitch = Float(pitchCents)
        }

        channel.applyVolume()
    }

    func unloadSample(channelId: Int) {
        os_unfair_lock_lock(lock)
        defer { os_unfair_lock_unlock(lock) }

        channels[channelId]?.buffer = nil
    }

    // MARK: - Pattern updates

    func updatePattern(channelId: Int, steps: [Bool], tripletSteps: [Bool]) {
        os_unfair_lock_lock(lock)
        defer { os_unfair_lock_unlock(lock) }

        guard let channel = channels[channelId] else { return }
        channel.steps = steps
        channel.tripletSteps = tripletSteps
    }

    // MARK: - Channel state

    func setChannelMuted(id: Int, muted: Bool) {
        os_unfair_lock_lock(lock)
        defer { os_unfair_lock_unlock(lock) }
        channels[id]?.muted = muted
    }

    func setChannelSolo(id: Int, solo: Bool) {
        os_unfair_lock_lock(lock)
        defer { os_unfair_lock_unlock(lock) }
        channels[id]?.solo = solo
    }

    func setChannelVolume(id: Int, volume: Float) {
        os_unfair_lock_lock(lock)
        defer { os_unfair_lock_unlock(lock) }

        guard let channel = channels[id] else { return }
        channel.channelVolume = volume
        channel.applyVolume()
    }

    func setSampleVolume(id: Int, volume: Float) {
        os_unfair_lock_lock(lock)
        defer { os_unfair_lock_unlock(lock) }

        guard let channel = channels[id] else { return }
        channel.sampleVolume = volume
        channel.applyVolume()
    }

    // MARK: - Sequencer params

    func updateSequencer(bpm: Double, stepCount: Int, swing: Double) {
        os_unfair_lock_lock(lock)
        defer { os_unfair_lock_unlock(lock) }

        self.bpm = bpm
        self.stepCount = stepCount
        self.swing = swing
    }

    // MARK: - Transport

    func play() {
        os_unfair_lock_lock(lock)
        guard !isPlaying else {
            os_unfair_lock_unlock(lock)
            return
        }
        isPlaying = true
        currentStep = 0
        currentTripletStep = 0

        let now = HostTimeUtils.now
        playStartHostTime = now
        nextStepHostTime = now
        nextTripletHostTime = now

        // Collect players that need starting while under lock
        var playersToStart: [AVAudioPlayerNode] = []
        for (_, channel) in channels {
            for player in channel.playerNodes {
                if !player.isPlaying {
                    playersToStart.append(player)
                }
            }
        }
        os_unfair_lock_unlock(lock)

        ensureEngineRunning()

        for player in playersToStart {
            player.play()
        }

        startScheduler()
    }

    func stop() {
        stopScheduler()

        os_unfair_lock_lock(lock)
        isPlaying = false
        currentStep = 0
        currentTripletStep = 0
        os_unfair_lock_unlock(lock)

        onStepChange?(-1, -1)
    }

    // MARK: - Preview

    func previewSample(channelId: Int) {
        os_unfair_lock_lock(lock)
        guard let channel = channels[channelId],
              let buffer = channel.buffer else {
            os_unfair_lock_unlock(lock)
            return
        }
        let player = channel.nextPlayer
        os_unfair_lock_unlock(lock)

        ensureEngineRunning()
        if !player.isPlaying {
            player.play()
        }
        player.scheduleBuffer(buffer, at: nil, options: .interrupts, completionHandler: nil)
    }

    // MARK: - Scheduler

    private func startScheduler() {
        stopScheduler()

        let timer = DispatchSource.makeTimerSource(queue: schedulerQueue)
        timer.schedule(deadline: .now(), repeating: .milliseconds(10), leeway: .milliseconds(1))
        timer.setEventHandler { [weak self] in
            self?.schedulerTick()
        }
        schedulerTimer = timer
        timer.resume()
    }

    private func stopScheduler() {
        schedulerTimer?.cancel()
        schedulerTimer = nil
    }

    private func schedulerTick() {
        os_unfair_lock_lock(lock)
        guard isPlaying else {
            os_unfair_lock_unlock(lock)
            return
        }

        let now = HostTimeUtils.now
        let lookaheadTicks = HostTimeUtils.secondsToHostTime(lookaheadSeconds)
        let deadline = now + lookaheadTicks

        let stepDuration = (60.0 / bpm) / 4.0
        let tripletDuration = stepDuration * (2.0 / 3.0)
        let tripletCount = max(1, Int(floor(Double(stepCount) * 3.0 / 2.0)))
        let swingAmount = (swing / 100.0) * 0.75

        let hasSolo = channels.values.contains { $0.solo }

        // Snapshot values we need — channels dict is reference types so snapshot is shallow
        let channelSnapshot = Array(channels.values)

        // Schedule normal steps
        while nextStepHostTime <= deadline {
            let step = currentStep
            let scheduleTime = nextStepHostTime

            let isOffbeat = step % 2 == 1
            let swingDelaySeconds = isOffbeat ? swingAmount * stepDuration : 0.0
            let swingDelayTicks = HostTimeUtils.secondsToHostTime(swingDelaySeconds)
            let actualTime = scheduleTime + swingDelayTicks

            for channel in channelSnapshot {
                guard step < channel.steps.count, channel.steps[step] else { continue }
                guard let buffer = channel.buffer else { continue }
                guard !channel.muted else { continue }
                if hasSolo && !channel.solo { continue }

                let player = channel.nextPlayer
                let audioTime = AVAudioTime(hostTime: actualTime)
                player.scheduleBuffer(buffer, at: audioTime, options: [], completionHandler: nil)
            }

            let stepCallback = self.onStepChange
            let capturedTripletStep = currentTripletStep
            DispatchQueue.main.async {
                stepCallback?(step, capturedTripletStep)
            }

            nextStepHostTime += HostTimeUtils.secondsToHostTime(stepDuration)
            currentStep = (currentStep + 1) % max(1, stepCount)
        }

        // Schedule triplet steps
        while nextTripletHostTime <= deadline {
            let tripletStep = currentTripletStep

            for channel in channelSnapshot {
                guard tripletStep < channel.tripletSteps.count, channel.tripletSteps[tripletStep] else { continue }
                guard let buffer = channel.buffer else { continue }
                guard !channel.muted else { continue }
                if hasSolo && !channel.solo { continue }

                let player = channel.nextPlayer
                let audioTime = AVAudioTime(hostTime: nextTripletHostTime)
                player.scheduleBuffer(buffer, at: audioTime, options: [], completionHandler: nil)
            }

            nextTripletHostTime += HostTimeUtils.secondsToHostTime(tripletDuration)
            currentTripletStep = (currentTripletStep + 1) % tripletCount
        }

        os_unfair_lock_unlock(lock)
    }
}
