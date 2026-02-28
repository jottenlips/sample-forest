/**
 * Creates an inline Web Worker for the sequencer clock.
 *
 * The worker runs the timing loop (setInterval) off the main thread.
 * Safari throttles setInterval on the main thread but NOT inside Workers,
 * so this gives us rock-solid timing even during heavy React renders.
 *
 * Messages:
 *   Main → Worker: start, stop, update
 *   Worker → Main: triggers (which channels to play), step (UI position)
 */

// The worker code is inlined as a string so Metro can bundle it
// without needing native Worker/import.meta.url support.
const WORKER_CODE = `
"use strict";

var config = null;
var isPlaying = false;
var currentStep = 0;
var currentTripletStep = 0;
var nextStepTime = 0;
var nextTripletTime = 0;
var timer = null;
var lastUIUpdate = 0;

var LOOKAHEAD_MS = 100;
var TICK_MS = 20;
var UI_THROTTLE_MS = 100; // ~10fps for step highlight

function getTripletStepCount(stepCount) {
  return Math.floor(stepCount * 3 / 2);
}

function start() {
  if (isPlaying) return;
  isPlaying = true;
  currentStep = 0;
  currentTripletStep = 0;
  var now = performance.now();
  nextStepTime = now;
  nextTripletTime = now;
  lastUIUpdate = 0;
  timer = setInterval(tick, TICK_MS);
}

function stop() {
  isPlaying = false;
  if (timer !== null) {
    clearInterval(timer);
    timer = null;
  }
  postMessage({ type: "step", currentStep: 0, currentTripletStep: 0 });
}

function tick() {
  if (!isPlaying || !config) return;

  var now = performance.now();
  var baseStepDuration = (60000 / config.bpm) / 4;
  var baseTripletDuration = baseStepDuration * (2 / 3);

  var stepDuration = baseStepDuration;
  var tripletDuration = baseTripletDuration;
  var punchIn = config.punchIn;

  if (punchIn === "double") {
    stepDuration = baseStepDuration / 2;
    tripletDuration = baseTripletDuration / 2;
  } else if (punchIn === "half") {
    stepDuration = baseStepDuration * 2;
    tripletDuration = baseTripletDuration * 2;
  }

  var swingAmount = (config.swing / 100) * 0.75;
  var channels = config.channels;
  var hasSolo = false;
  for (var i = 0; i < channels.length; i++) {
    if (channels[i].solo) { hasSolo = true; break; }
  }

  // Build swap map once per tick if needed
  var swapMap = null;
  if (punchIn === "swap" && channels.length > 1) {
    swapMap = {};
    for (var i = 0; i < channels.length; i++) {
      swapMap[channels[i].channelId] = channels[(i + 1) % channels.length].channelId;
    }
  }

  var triggers = [];

  // Schedule normal steps
  while (nextStepTime < now + LOOKAHEAD_MS) {
    var step = currentStep;

    if (punchIn === "repeat" && config.repeatBeatOrigin !== null) {
      var beatOrigin = config.repeatBeatOrigin;
      var beatLength = 4;
      step = beatOrigin + ((step - beatOrigin) % beatLength + beatLength) % beatLength;
    }

    var isOffbeat = step % 2 === 1;
    var swingDelay = isOffbeat ? swingAmount * stepDuration : 0;
    var delay = nextStepTime - now + swingDelay;

    // Determine which channels fire on this step
    for (var ci = 0; ci < channels.length; ci++) {
      var ch = channels[ci];
      if (step >= ch.steps.length || !ch.steps[step]) continue;
      if (ch.muted) continue;
      if (hasSolo && !ch.solo) continue;
      if (!ch.hasSample) continue;

      var triggerChannelId = ch.channelId;
      if (punchIn === "swap" && swapMap) {
        var swappedTo = swapMap[ch.channelId];
        if (swappedTo !== undefined) {
          // Check if the swapped-to channel has a sample
          var swappedCh = null;
          for (var si = 0; si < channels.length; si++) {
            if (channels[si].channelId === swappedTo) { swappedCh = channels[si]; break; }
          }
          if (swappedCh && swappedCh.hasSample) {
            triggerChannelId = swappedTo;
          } else {
            continue;
          }
        }
      }

      triggers.push({ channelId: triggerChannelId, delay: Math.max(0, delay), step: step });
    }

    nextStepTime += stepDuration;
    currentStep = (currentStep + 1) % config.stepCount;
  }

  // Schedule triplet steps
  var tripletCount = getTripletStepCount(config.stepCount);
  while (nextTripletTime < now + LOOKAHEAD_MS) {
    var tripletStep = currentTripletStep;

    if (punchIn === "repeat" && config.repeatBeatOrigin !== null) {
      var tripletBeatOrigin = Math.floor(config.repeatBeatOrigin / 4) * 6;
      var tripletBeatLength = 6;
      tripletStep = tripletBeatOrigin + ((tripletStep - tripletBeatOrigin) % tripletBeatLength + tripletBeatLength) % tripletBeatLength;
    }

    var tDelay = nextTripletTime - now;

    for (var ci = 0; ci < channels.length; ci++) {
      var ch = channels[ci];
      if (tripletStep >= ch.tripletSteps.length || !ch.tripletSteps[tripletStep]) continue;
      if (ch.muted) continue;
      if (hasSolo && !ch.solo) continue;
      if (!ch.hasSample) continue;

      var triggerChannelId = ch.channelId;
      if (punchIn === "swap" && swapMap) {
        var swappedTo = swapMap[ch.channelId];
        if (swappedTo !== undefined) {
          var swappedCh = null;
          for (var si = 0; si < channels.length; si++) {
            if (channels[si].channelId === swappedTo) { swappedCh = channels[si]; break; }
          }
          if (swappedCh && swappedCh.hasSample) {
            triggerChannelId = swappedTo;
          } else {
            continue;
          }
        }
      }

      triggers.push({ channelId: triggerChannelId, delay: Math.max(0, tDelay), isTriplet: true });
    }

    nextTripletTime += tripletDuration;
    currentTripletStep = (currentTripletStep + 1) % Math.max(1, tripletCount);
  }

  // Send trigger batch
  if (triggers.length > 0) {
    postMessage({ type: "triggers", triggers: triggers });
  }

  // Send UI step update (throttled)
  if (now - lastUIUpdate >= UI_THROTTLE_MS) {
    lastUIUpdate = now;
    postMessage({ type: "step", currentStep: currentStep, currentTripletStep: currentTripletStep });
  }
}

onmessage = function(e) {
  var msg = e.data;
  switch (msg.type) {
    case "start":
      config = msg.config;
      start();
      break;
    case "stop":
      stop();
      break;
    case "update":
      config = msg.config;
      break;
  }
};
`;

let cachedBlobUrl: string | null = null;

export function createSequencerWorker(): Worker {
  if (!cachedBlobUrl) {
    const blob = new Blob([WORKER_CODE], { type: 'application/javascript' });
    cachedBlobUrl = URL.createObjectURL(blob);
  }
  return new Worker(cachedBlobUrl);
}

/** Config shape sent to the worker (must be serializable) */
export interface WorkerSequencerConfig {
  bpm: number;
  swing: number;
  stepCount: number;
  punchIn: string | null;
  repeatBeatOrigin: number | null;
  channels: {
    channelId: number;
    steps: boolean[];
    tripletSteps: boolean[];
    muted: boolean;
    solo: boolean;
    hasSample: boolean;
  }[];
}

export interface TriggerMessage {
  type: 'triggers';
  triggers: { channelId: number; delay: number; step?: number; isTriplet?: boolean }[];
}

export interface StepMessage {
  type: 'step';
  currentStep: number;
  currentTripletStep: number;
}

export type WorkerMessage = TriggerMessage | StepMessage;
