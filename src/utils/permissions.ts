import { Audio } from 'expo-av';
import { Alert, Platform } from 'react-native';

export async function requestMicrophonePermission(): Promise<boolean> {
  if (Platform.OS === 'web') {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Stop the stream immediately — we just needed permission
      stream.getTracks().forEach((t) => t.stop());
      return true;
    } catch {
      alert('Sample Forest needs microphone access to record audio samples.');
      return false;
    }
  }

  const { status } = await Audio.requestPermissionsAsync();
  if (status !== 'granted') {
    Alert.alert(
      'Permission Required',
      'Sample Forest needs microphone access to record audio samples. Please enable it in Settings.',
    );
    return false;
  }
  return true;
}

export async function setupAudioMode() {
  if (Platform.OS === 'web') return;
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: false,
    playsInSilentModeIOS: true,
    staysActiveInBackground: false,
    shouldDuckAndroid: true,
  });
}

export async function enableRecordingMode() {
  if (Platform.OS === 'web') return;
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: true,
    playsInSilentModeIOS: true,
    staysActiveInBackground: false,
    shouldDuckAndroid: true,
  });
}

export async function disableRecordingMode() {
  if (Platform.OS === 'web') return;
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: false,
    playsInSilentModeIOS: true,
    staysActiveInBackground: false,
    shouldDuckAndroid: true,
  });
}
