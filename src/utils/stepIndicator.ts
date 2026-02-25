/**
 * Lightweight external store for the playback step indicator.
 * Lives outside React/Zustand so step-position updates bypass
 * the full component tree.  Individual StepButtons subscribe
 * via useSyncExternalStore and only re-render when *their*
 * particular step becomes (or stops being) the current one.
 */

type Listener = () => void;

let _step = -1;
let _tripletStep = -1;
let _isPlaying = false;
const _listeners = new Set<Listener>();

function notify() {
  for (const l of _listeners) l();
}

export const stepIndicator = {
  getStep: () => _step,
  getTripletStep: () => _tripletStep,
  getIsPlaying: () => _isPlaying,

  setStep(step: number) {
    if (_step === step) return;
    _step = step;
    notify();
  },

  setTripletStep(step: number) {
    if (_tripletStep === step) return;
    _tripletStep = step;
    notify();
  },

  setIsPlaying(playing: boolean) {
    _isPlaying = playing;
    if (!playing) {
      _step = -1;
      _tripletStep = -1;
    }
    notify();
  },

  subscribe(listener: Listener) {
    _listeners.add(listener);
    return () => {
      _listeners.delete(listener);
    };
  },
};
