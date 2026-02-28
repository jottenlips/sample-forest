import { useState, useRef, useCallback } from 'react';
import { Platform } from 'react-native';
import { Audio } from 'expo-av';
import { requestMicrophonePermission, enableRecordingMode, disableRecordingMode } from '../utils/permissions';
import { saveSampleFile, createSampleFromRecording, generateWaveformData } from '../utils/audioFiles';
import { Sample } from '../types';

function useWebRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(0);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const waveformRef = useRef<number[]>([]);
  const animFrameRef = useRef<number | null>(null);

  const startRecording = useCallback(async (): Promise<boolean> => {
    const hasPermission = await requestMicrophonePermission();
    if (!hasPermission) return false;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Set up analyser for waveform data
      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;
      waveformRef.current = [];

      // Capture waveform during recording
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const captureWaveform = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteTimeDomainData(dataArray);
        // Get peak amplitude for this frame
        let peak = 0;
        for (let i = 0; i < dataArray.length; i++) {
          const amplitude = Math.abs(dataArray[i] - 128) / 128;
          if (amplitude > peak) peak = amplitude;
        }
        waveformRef.current.push(Math.max(0.05, peak));
        animFrameRef.current = requestAnimationFrame(captureWaveform);
      };
      animFrameRef.current = requestAnimationFrame(captureWaveform);

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start(100); // Collect data every 100ms
      startTimeRef.current = Date.now();
      setIsRecording(true);
      setRecordingDuration(0);

      timerRef.current = setInterval(() => {
        setRecordingDuration(Date.now() - startTimeRef.current);
      }, 100);

      return true;
    } catch (err) {
      console.error('Failed to start web recording:', err);
      return false;
    }
  }, []);

  const stopRecording = useCallback(async (): Promise<Sample | null> => {
    return new Promise((resolve) => {
      if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') {
        setIsRecording(false);
        resolve(null);
        return;
      }

      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }

      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      analyserRef.current = null;

      const recorder = mediaRecorderRef.current;

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
        const uri = URL.createObjectURL(blob);
        const durationMs = Date.now() - startTimeRef.current;

        // Stop all tracks
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
        }

        mediaRecorderRef.current = null;
        setIsRecording(false);

        // Downsample waveform to 50 points
        const rawWaveform = waveformRef.current;
        let waveformData: number[];
        if (rawWaveform.length > 50) {
          const step = rawWaveform.length / 50;
          waveformData = Array.from({ length: 50 }, (_, i) => {
            const start = Math.floor(i * step);
            const end = Math.floor((i + 1) * step);
            let max = 0;
            for (let j = start; j < end && j < rawWaveform.length; j++) {
              if (rawWaveform[j] > max) max = rawWaveform[j];
            }
            return Math.max(0.05, max);
          });
        } else {
          waveformData = rawWaveform.length > 0 ? rawWaveform : generateWaveformData();
        }

        const sample: Sample = {
          id: `sample_${Date.now()}`,
          uri,
          name: `Recording ${new Date().toLocaleTimeString()}`,
          durationMs,
          trimStartMs: 0,
          trimEndMs: durationMs,
          playbackRate: 1.0,
          preservePitch: true,
          volume: 1.0,
          waveformData,
        };

        resolve(sample);
      };

      recorder.stop();
    });
  }, []);

  return { isRecording, recordingDuration, startRecording, stopRecording };
}

function useNativeRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startRecording = useCallback(async (): Promise<boolean> => {
    const hasPermission = await requestMicrophonePermission();
    if (!hasPermission) return false;

    try {
      await enableRecordingMode();

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY,
      );
      recordingRef.current = recording;
      setIsRecording(true);
      setRecordingDuration(0);

      const startTime = Date.now();
      timerRef.current = setInterval(() => {
        setRecordingDuration(Date.now() - startTime);
      }, 100);

      return true;
    } catch (err) {
      console.error('Failed to start recording:', err);
      return false;
    }
  }, []);

  const stopRecording = useCallback(async (): Promise<Sample | null> => {
    if (!recordingRef.current) return null;

    try {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }

      await recordingRef.current.stopAndUnloadAsync();
      await disableRecordingMode();

      const uri = recordingRef.current.getURI();
      const status = await recordingRef.current.getStatusAsync();
      recordingRef.current = null;
      setIsRecording(false);

      if (!uri) return null;

      const durationMs = status.durationMillis || recordingDuration;
      const savedUri = await saveSampleFile(uri, `recording_${Date.now()}.m4a`);
      return createSampleFromRecording(savedUri, durationMs);
    } catch (err) {
      console.error('Failed to stop recording:', err);
      setIsRecording(false);
      return null;
    }
  }, [recordingDuration]);

  return { isRecording, recordingDuration, startRecording, stopRecording };
}

export function useRecorder() {
  if (Platform.OS === 'web') {
    return useWebRecorder();
  }
  return useNativeRecorder();
}
