// K23-K28: lokale biplyde, kortvarig dæmpning af anden lyd og afbrydelser.
// expo-audio med interruptionMode 'duckOthers' anmoder om midlertidig dæmpning, når en lyd starter,
// og frigiver lydsessionen/audio focus, når den er færdig (notifyOthersOnDeactivation på iOS,
// abandonAudioFocus på Android). Run Pace ændrer aldrig telefonens samlede lydstyrke.
import { AudioPlayer, createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import * as Speech from 'expo-speech';
import { Vibration } from 'react-native';
import { SOUND_DURATION_MS, SoundId } from '../core/settings';

export type CueSound = SoundId | 'STAGE';

const SOURCES: Record<CueSound, number> = {
  B01: require('../../assets/sounds/b01.wav'),
  B02: require('../../assets/sounds/b02.wav'),
  B03: require('../../assets/sounds/b03.wav'),
  B04: require('../../assets/sounds/b04.wav'),
  B05: require('../../assets/sounds/b05.wav'),
  B06: require('../../assets/sounds/b06.wav'),
  B07: require('../../assets/sounds/b07.wav'),
  B08: require('../../assets/sounds/b08.wav'),
  B09: require('../../assets/sounds/b09.wav'),
  B10: require('../../assets/sounds/b10.wav'),
  STAGE: require('../../assets/sounds/stage.wav'),
};

const players = new Map<CueSound, AudioPlayer>();
let configured = false;
/** Lyde, der ikke er startet inden for denne tid, annulleres (K28: ingen forsinket afspilning). */
const START_DEADLINE_MS = 1000;

export async function configureAudio(): Promise<void> {
  if (configured) return;
  await setAudioModeAsync({
    playsInSilentMode: true,
    interruptionMode: 'duckOthers',
    shouldPlayInBackground: true,
    allowsRecording: false,
    shouldRouteThroughEarpiece: false,
  });
  configured = true;
}

function player(id: CueSound): AudioPlayer {
  let p = players.get(id);
  if (!p) {
    p = createAudioPlayer(SOURCES[id], { keepAudioSessionActive: false });
    players.set(id, p);
  }
  return p;
}

/** Forudindlæs alle lyde, så et signal kan starte inden for 1 sekund (K51). */
export function preloadSounds() {
  (Object.keys(SOURCES) as CueSound[]).forEach((id) => player(id));
}

/**
 * Afspiller et signal. Returnerer true, hvis lyden faktisk startede.
 * Starter den ikke inden for fristen (fx under et opkald), stoppes den, så den aldrig afspilles senere.
 */
export async function playCue(id: CueSound, volume: number): Promise<boolean> {
  try {
    await configureAudio();
    const p = player(id);
    p.pause();
    await p.seekTo(0);
    p.volume = Math.max(0, Math.min(1, volume));
    p.play();
    const started = await waitForPlaying(p, START_DEADLINE_MS);
    if (!started) {
      p.pause();
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function waitForPlaying(p: AudioPlayer, ms: number): Promise<boolean> {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const check = () => {
      if (p.playing || p.currentTime > 0.02) return resolve(true);
      if (Date.now() - t0 >= ms) return resolve(false);
      setTimeout(check, 50);
    };
    check();
  });
}

export function cueDurationMs(id: CueSound): number {
  return SOUND_DURATION_MS[id];
}

export function vibrate(kind: 'fast' | 'slow' | 'stage') {
  // Mønstre der kan skelnes uden lyd: kort-kort (hurtigt), lang (langsomt), tre korte (etape).
  const pattern = kind === 'fast' ? [0, 120, 120, 120] : kind === 'slow' ? [0, 450] : [0, 80, 80, 80, 80, 80];
  Vibration.vibrate(pattern);
}

export function speak(text: string, lang: 'da' | 'en') {
  try {
    Speech.stop();
    Speech.speak(text, { language: lang === 'da' ? 'da-DK' : 'en-GB', rate: 1.0 });
  } catch {
    // tale er valgfri
  }
}

export function stopSpeech() {
  try {
    Speech.stop();
  } catch {
    /* ignorer */
  }
}

/** K27: Test lyd demonstrerer den faktiske dæmpning med de valgte lyde. */
export async function testSound(fast: SoundId, slow: SoundId, volume: number): Promise<void> {
  await playCue(fast, volume);
  await delay(cueDurationMs(fast) + 900);
  await playCue(slow, volume);
  await delay(cueDurationMs(slow) + 900);
  await playCue('STAGE', volume);
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
