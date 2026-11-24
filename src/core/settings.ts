// Standardindstillinger (K18, K23, K24, K28, K31). Gemmes og fryses i hver session (K46).
import { DEFAULT_TOLERANCE, ToleranceSpec } from './tolerance';
import { DistanceUnit, Lang, PaceUnit } from './units';

export type SoundId = 'B01' | 'B02' | 'B03' | 'B04' | 'B05' | 'B06' | 'B07' | 'B08' | 'B09' | 'B10';
export const SOUND_IDS: SoundId[] = ['B01', 'B02', 'B03', 'B04', 'B05', 'B06', 'B07', 'B08', 'B09', 'B10'];

/** Varighed af hver lydfil i ms (skal matche assets/sounds, alle <= 1500 ms). */
export const SOUND_DURATION_MS: Record<SoundId | 'STAGE', number> = {
  B01: 220,
  B02: 260,
  B03: 420,
  B04: 460,
  B05: 910,
  B06: 910,
  B07: 700,
  B08: 520,
  B09: 900,
  B10: 760,
  STAGE: 1100,
};

export interface CoachingSettings {
  tolerance: ToleranceSpec;
  /** Udjævningsvindue i sekunder: 5, 10 eller 15. */
  windowSec: 5 | 10 | 15;
  /** Vedvarende afvigelse før bip, 3-15 s. */
  deviationSec: number;
  /** Minimumstid mellem korrektioner, 10-180 s. */
  cooldownSec: number;
  /** Tilvænning efter start, etapeskift og genfundet signal, 5-30 s. */
  settleSec: number;
  /** K21: tid og margen for tilstanden Stabil. */
  stableSec: number;
  stableMarginFrac: number;
}

export interface FeedbackSettings {
  soundFast: SoundId;
  soundSlow: SoundId;
  /** Relativ lydstyrke for signaler, 0.1-1. */
  volume: number;
  soundOn: boolean;
  vibration: boolean;
  /** K13: kort tale om næste etape. */
  speakStage: boolean;
  /** K28: fortsæt på højttaler ved tab af høretelefoner kræver aktivt valg. */
  speakerAfterHeadphoneLoss: boolean;
}

export interface AppSettings {
  lang: Lang;
  paceUnit: PaceUnit;
  distanceUnit: DistanceUnit;
  coaching: CoachingSettings;
  feedback: FeedbackSettings;
  /** Nedtælling før start i sekunder (0 = ingen). */
  countdownSec: number;
  /** K48: ruter i fejllogs kræver aktivt valg. */
  allowLocationInLogs: boolean;
  /** K41: introduktionen med maskotten er vist. */
  introSeen: boolean;
}

export const DEFAULT_COACHING: CoachingSettings = {
  tolerance: DEFAULT_TOLERANCE,
  windowSec: 10,
  deviationSec: 5,
  cooldownSec: 30,
  settleSec: 15,
  stableSec: 2,
  stableMarginFrac: 0.005,
};

export const DEFAULT_FEEDBACK: FeedbackSettings = {
  soundFast: 'B06',
  soundSlow: 'B05',
  volume: 0.8,
  soundOn: true,
  vibration: false,
  speakStage: false,
  speakerAfterHeadphoneLoss: false,
};

export const DEFAULT_SETTINGS: AppSettings = {
  lang: 'da',
  paceUnit: 'minkm',
  distanceUnit: 'km',
  coaching: DEFAULT_COACHING,
  feedback: DEFAULT_FEEDBACK,
  countdownSec: 3,
  allowLocationInLogs: false,
  introSeen: false,
};

export const LIMITS = {
  deviationSec: [3, 15] as const,
  cooldownSec: [10, 180] as const,
  settleSec: [5, 30] as const,
  windowSec: [5, 10, 15] as const,
  countdownSec: [0, 10] as const,
};

function clamp(v: unknown, lo: number, hi: number, fallback: number): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  return Math.min(hi, Math.max(lo, n));
}

/** Sikrer gyldige værdier efter indlæsning/import (K50). */
export function sanitizeSettings(raw: unknown): AppSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<AppSettings>;
  const c = { ...DEFAULT_COACHING, ...(r.coaching ?? {}) };
  const f = { ...DEFAULT_FEEDBACK, ...(r.feedback ?? {}) };
  const sound = (s: unknown, d: SoundId): SoundId => (SOUND_IDS.includes(s as SoundId) ? (s as SoundId) : d);
  return {
    lang: r.lang === 'en' ? 'en' : 'da',
    paceUnit: (['kmh', 'mph', 'minkm', 'minmi'] as PaceUnit[]).includes(r.paceUnit as PaceUnit)
      ? (r.paceUnit as PaceUnit)
      : DEFAULT_SETTINGS.paceUnit,
    distanceUnit: r.distanceUnit === 'mi' ? 'mi' : 'km',
    coaching: {
      tolerance: c.tolerance ?? DEFAULT_TOLERANCE,
      windowSec: ([5, 10, 15] as const).includes(c.windowSec) ? c.windowSec : 10,
      deviationSec: clamp(c.deviationSec, 3, 15, 5),
      cooldownSec: clamp(c.cooldownSec, 10, 180, 30),
      settleSec: clamp(c.settleSec, 5, 30, 15),
      stableSec: clamp(c.stableSec, 0, 10, 2),
      stableMarginFrac: clamp(c.stableMarginFrac, 0, 0.05, 0.005),
    },
    feedback: {
      soundFast: sound(f.soundFast, 'B06'),
      soundSlow: sound(f.soundSlow, 'B05'),
      volume: clamp(f.volume, 0.1, 1, 0.8),
      soundOn: f.soundOn !== false,
      vibration: !!f.vibration,
      speakStage: !!f.speakStage,
      speakerAfterHeadphoneLoss: !!f.speakerAfterHeadphoneLoss,
    },
    countdownSec: clamp(r.countdownSec, 0, 10, 3),
    allowLocationInLogs: !!r.allowLocationInLogs,
    introSeen: !!r.introSeen,
  };
}
