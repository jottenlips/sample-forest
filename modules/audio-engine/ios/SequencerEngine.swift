import AVFoundation

struct ChannelConfig {
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

struct SequencerConfig {
  var bpm: Double
  var stepCount: Int
  var swing: Double
  var channels: [ChannelConfig]
  var punchIn: String?
  var repeatBeatOrigin: Int?

  var tripletStepCount: Int {
    Int(floor(Double(stepCount) * 3.0 / 2.0))
  }

  static func from(dict: [String: Any]) -> SequencerConfig {
    let bpm = dict["bpm"] as? Double ?? 120
    let stepCount = dict["stepCount"] as? Int ?? 16
    let swing = dict["swing"] as? Double ?? 0
    let punchIn = dict["punchIn"] as? String
    let repeatBeatOrigin = dict["repeatBeatOrigin"] as? Int

    var channels: [ChannelConfig] = []
    if let chArray = dict["channels"] as? [[String: Any]] {
      for ch in chArray {
        channels.append(ChannelConfig(
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
        ))
      }
    }

    return SequencerConfig(
      bpm: bpm,
      stepCount: stepCount,
      swing: swing,
      channels: channels,
      punchIn: punchIn,
      repeatBeatOrigin: repeatBeatOrigin
    )
  }
}

class SequencerEngine {
  private let bufferPool: AudioBufferPool
  private let onStepChange: (Int, Int) -> Void

  private let engine = AVAudioEngine()
  private let mixer = AVAudioMixerNode()
  private var playerNodes: [String: AVAudioPlayerNode] = [:]

  private var config: SequencerConfig?
  private var isPlaying = false

  private var timer: DispatchSourceTimer?
  private let schedulerQueue = DispatchQueue(label: "com.sampleforest.sequencer", qos: .userInteractive)

  private var currentStep: Int = 0
  private var currentTripletStep: Int = 0
  private var nextStepTime: Double = 0 // in seconds (host time)
  private var nextTripletTime: Double = 0

  private let lookaheadSec: Double = 0.1 // 100ms
  private let timerIntervalSec: Double = 0.02 // 20ms

  init(bufferPool: AudioBufferPool, onStepChange: @escaping (Int, Int) -> Void) {
    self.bufferPool = bufferPool
    self.onStepChange = onStepChange
    setupEngine()
  }

  private func setupEngine() {
    engine.attach(mixer)
    engine.connect(mixer, to: engine.mainMixerNode, format: nil)

    do {
      try AVAudioSession.sharedInstance().setCategory(.playback, mode: .default, options: [.mixWithOthers])
      try AVAudioSession.sharedInstance().setActive(true)
      try engine.start()
    } catch {
      print("AudioEngine setup error: \(error)")
    }
  }

  // MARK: - Player Node Management

  private func getOrCreatePlayerNode(for sampleId: String) -> AVAudioPlayerNode {
    if let node = playerNodes[sampleId] {
      return node
    }
    let node = AVAudioPlayerNode()
    engine.attach(node)
    engine.connect(node, to: mixer, format: nil)
    playerNodes[sampleId] = node
    node.play()
    return node
  }

  // MARK: - Sequencer Control

  func start(config: SequencerConfig) {
    guard !isPlaying else { return }
    self.config = config
    isPlaying = true

    currentStep = 0
    currentTripletStep = 0

    // Ensure engine is running
    if !engine.isRunning {
      try? engine.start()
    }

    // Set next step time to now
    let now = currentHostTimeInSeconds()
    nextStepTime = now
    nextTripletTime = now

    startTimer()
  }

  func stop() {
    isPlaying = false
    stopTimer()

    // Stop all player nodes
    for (_, node) in playerNodes {
      node.stop()
    }

    DispatchQueue.main.async { [weak self] in
      self?.onStepChange(0, 0)
    }
  }

  func updateConfig(_ newConfig: SequencerConfig) {
    schedulerQueue.async { [weak self] in
      self?.config = newConfig
    }
  }

  func triggerOneShot(sampleId: String) {
    guard let buffer = bufferPool.get(sampleId: sampleId) else { return }
    let node = getOrCreatePlayerNode(for: "oneshot_\(sampleId)")
    node.stop()
    if !engine.isRunning { try? engine.start() }
    node.play()
    node.scheduleBuffer(buffer, at: nil, options: .interrupts)
  }

  // MARK: - Timer

  private func startTimer() {
    let timer = DispatchSource.makeTimerSource(queue: schedulerQueue)
    timer.schedule(deadline: .now(), repeating: timerIntervalSec)
    timer.setEventHandler { [weak self] in
      self?.schedulerTick()
    }
    self.timer = timer
    timer.resume()
  }

  private func stopTimer() {
    timer?.cancel()
    timer = nil
  }

  // MARK: - Scheduler Tick

  private func schedulerTick() {
    guard isPlaying, let config = self.config else { return }

    let now = currentHostTimeInSeconds()
    let baseStepDuration = (60.0 / config.bpm) / 4.0 // seconds per step
    let baseTripletDuration = baseStepDuration * (2.0 / 3.0)

    // Apply tempo effects
    var stepDuration = baseStepDuration
    var tripletDuration = baseTripletDuration
    if config.punchIn == "double" {
      stepDuration = baseStepDuration / 2.0
      tripletDuration = baseTripletDuration / 2.0
    } else if config.punchIn == "half" {
      stepDuration = baseStepDuration * 2.0
      tripletDuration = baseTripletDuration * 2.0
    }

    let swingAmount = (config.swing / 100.0) * 0.75
    let hasSolo = config.channels.contains { $0.solo }

    // Build swap map if needed
    var swapMap: [Int: Int]? = nil
    if config.punchIn == "swap" && config.channels.count > 1 {
      var map = [Int: Int]()
      let ids = config.channels.map { $0.channelId }
      for i in 0..<ids.count {
        map[ids[i]] = ids[(i + 1) % ids.count]
      }
      swapMap = map
    }

    let prevStep = currentStep
    let prevTripletStep = currentTripletStep

    // Schedule normal steps
    while nextStepTime < now + lookaheadSec {
      var step = currentStep

      if config.punchIn == "repeat", let origin = config.repeatBeatOrigin {
        let beatLength = 4
        step = origin + ((step - origin) % beatLength + beatLength) % beatLength
      }

      let isOffbeat = step % 2 == 1
      let swingDelay = isOffbeat ? swingAmount * stepDuration : 0
      let scheduleTime = nextStepTime + swingDelay

      scheduleNormalStep(step: step, at: scheduleTime, config: config, hasSolo: hasSolo, swapMap: swapMap)

      nextStepTime += stepDuration
      currentStep = (currentStep + 1) % config.stepCount
    }

    // Schedule triplet steps
    let tripletCount = config.tripletStepCount
    while nextTripletTime < now + lookaheadSec {
      var tripletStep = currentTripletStep

      if config.punchIn == "repeat", let origin = config.repeatBeatOrigin {
        let tripletBeatOrigin = (origin / 4) * 6
        let tripletBeatLength = 6
        tripletStep = tripletBeatOrigin + ((tripletStep - tripletBeatOrigin) % tripletBeatLength + tripletBeatLength) % tripletBeatLength
      }

      scheduleTripletStep(step: tripletStep, at: nextTripletTime, config: config, hasSolo: hasSolo, swapMap: swapMap)

      nextTripletTime += tripletDuration
      currentTripletStep = (currentTripletStep + 1) % max(1, tripletCount)
    }

    // Emit a single UI update per tick, only if something changed
    if currentStep != prevStep || currentTripletStep != prevTripletStep {
      let uiStep = currentStep
      let uiTripletStep = currentTripletStep
      DispatchQueue.main.async { [weak self] in
        guard let self = self, self.isPlaying else { return }
        self.onStepChange(uiStep, uiTripletStep)
      }
    }
  }

  // MARK: - Step Scheduling

  private func scheduleNormalStep(step: Int, at time: Double, config: SequencerConfig, hasSolo: Bool, swapMap: [Int: Int]?) {
    for channel in config.channels {
      guard step < channel.steps.count, channel.steps[step] else { continue }
      guard !channel.muted else { continue }
      if hasSolo && !channel.solo { continue }

      let targetSampleId: String
      if let swapMap = swapMap, let swappedId = swapMap[channel.channelId] {
        // Find sample ID of the swapped channel
        if let swappedChannel = config.channels.first(where: { $0.channelId == swappedId }) {
          targetSampleId = swappedChannel.sampleId
        } else {
          continue
        }
      } else {
        guard !channel.sampleId.isEmpty else { continue }
        targetSampleId = channel.sampleId
      }

      scheduleBuffer(sampleId: targetSampleId, at: time, volume: channel.volume, rate: channel.playbackRate, trimStartMs: channel.trimStartMs, trimEndMs: channel.trimEndMs)
    }
  }

  private func scheduleTripletStep(step: Int, at time: Double, config: SequencerConfig, hasSolo: Bool, swapMap: [Int: Int]?) {
    for channel in config.channels {
      guard step < channel.tripletSteps.count, channel.tripletSteps[step] else { continue }
      guard !channel.muted else { continue }
      if hasSolo && !channel.solo { continue }

      let targetSampleId: String
      if let swapMap = swapMap, let swappedId = swapMap[channel.channelId] {
        if let swappedChannel = config.channels.first(where: { $0.channelId == swappedId }) {
          targetSampleId = swappedChannel.sampleId
        } else {
          continue
        }
      } else {
        guard !channel.sampleId.isEmpty else { continue }
        targetSampleId = channel.sampleId
      }

      scheduleBuffer(sampleId: targetSampleId, at: time, volume: channel.volume, rate: channel.playbackRate, trimStartMs: channel.trimStartMs, trimEndMs: channel.trimEndMs)
    }
  }

  private func scheduleBuffer(sampleId: String, at time: Double, volume: Float, rate: Float, trimStartMs: Double, trimEndMs: Double) {
    guard let buffer = bufferPool.get(sampleId: sampleId) else { return }

    let node = getOrCreatePlayerNode(for: sampleId)
    node.volume = volume
    node.rate = rate

    // Calculate trim frames
    let sampleRate = buffer.format.sampleRate
    let trimStartFrames = AVAudioFramePosition(trimStartMs / 1000.0 * sampleRate)
    let totalFrames = AVAudioFrameCount(buffer.frameLength)

    let trimEndFrames: AVAudioFrameCount
    if trimEndMs > 0 {
      trimEndFrames = min(AVAudioFrameCount(trimEndMs / 1000.0 * sampleRate), totalFrames)
    } else {
      trimEndFrames = totalFrames
    }

    let startFrame = min(AVAudioFrameCount(trimStartFrames), totalFrames)
    let frameCount = trimEndFrames > startFrame ? trimEndFrames - startFrame : totalFrames

    // Schedule at precise AVAudioTime
    let hostTime = secondsToHostTime(time)
    let audioTime = AVAudioTime(hostTime: hostTime)

    // Schedule segment of buffer
    node.scheduleSegment(buffer, startingFrame: AVAudioFramePosition(startFrame), frameCount: frameCount, at: audioTime)
  }

  // MARK: - Time Utilities

  private func currentHostTimeInSeconds() -> Double {
    var timebaseInfo = mach_timebase_info_data_t()
    mach_timebase_info(&timebaseInfo)
    let hostTime = mach_absolute_time()
    let nanos = Double(hostTime) * Double(timebaseInfo.numer) / Double(timebaseInfo.denom)
    return nanos / 1_000_000_000.0
  }

  private func secondsToHostTime(_ seconds: Double) -> UInt64 {
    var timebaseInfo = mach_timebase_info_data_t()
    mach_timebase_info(&timebaseInfo)
    let nanos = seconds * 1_000_000_000.0
    return UInt64(nanos * Double(timebaseInfo.denom) / Double(timebaseInfo.numer))
  }
}
