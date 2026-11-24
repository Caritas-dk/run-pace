// K18: tolerance som sekunder pr. km/mile, som fart eller som procent af målfarten.
// Grænserne omsættes til m/s før sammenligning. Grænserne er inklusive.
import { DistanceUnit, unitMeters } from './units';

export type ToleranceSpec =
  | { kind: 'seconds'; per: DistanceUnit; faster: number; slower: number }
  | { kind: 'speed'; fasterMps: number; slowerMps: number }
  | { kind: 'percent'; faster: number; slower: number };

export const DEFAULT_TOLERANCE: ToleranceSpec = { kind: 'seconds', per: 'km', faster: 10, slower: 10 };

export interface Bounds {
  /** Laveste accepterede fart (langsomste tempo). */
  minMps: number;
  /** Højeste accepterede fart (hurtigste tempo). */
  maxMps: number;
  targetMps: number;
}

export type ToleranceError =
  | 'negative'
  | 'pace_not_positive' // sekundtolerance giver ikke-positivt tempo
  | 'percent_too_high' // procent skal være under 100
  | 'speed_not_positive'; // fartgrænse <= 0

export function validateTolerance(spec: ToleranceSpec, targetMps: number): ToleranceError | null {
  switch (spec.kind) {
    case 'seconds': {
      if (!(spec.faster >= 0) || !(spec.slower >= 0)) return 'negative';
      const pace = unitMeters(spec.per) / targetMps;
      if (pace - spec.faster <= 0) return 'pace_not_positive';
      return null;
    }
    case 'speed': {
      if (!(spec.fasterMps >= 0) || !(spec.slowerMps >= 0)) return 'negative';
      if (targetMps - spec.slowerMps <= 0) return 'speed_not_positive';
      return null;
    }
    case 'percent': {
      if (!(spec.faster >= 0) || !(spec.slower >= 0)) return 'negative';
      if (spec.slower >= 100) return 'percent_too_high';
      return null;
    }
  }
}

export function computeBounds(spec: ToleranceSpec, targetMps: number): Bounds {
  let minMps: number;
  let maxMps: number;
  switch (spec.kind) {
    case 'seconds': {
      const L = unitMeters(spec.per);
      const pace = L / targetMps; // sekunder pr. enhed
      maxMps = L / (pace - spec.faster);
      minMps = L / (pace + spec.slower);
      break;
    }
    case 'speed':
      maxMps = targetMps + spec.fasterMps;
      minMps = targetMps - spec.slowerMps;
      break;
    case 'percent':
      maxMps = targetMps * (1 + spec.faster / 100);
      minMps = targetMps * (1 - spec.slower / 100);
      break;
  }
  return { minMps, maxMps, targetMps };
}

export type Zone = 'in' | 'fast' | 'slow';

// Relativ margen, så værdier præcis på grænsen (fx 5:50 ved 6:00 +/-10 s) tælles som indenfor
// uanset afrunding i flydende tal.
const EPS = 1e-9;

export function classify(speedMps: number, b: Bounds): Zone {
  if (speedMps > b.maxMps * (1 + EPS)) return 'fast';
  if (speedMps < b.minMps * (1 - EPS)) return 'slow';
  return 'in';
}

/** K21: Stabil kræver at farten ligger mindst `marginFrac` af målfarten inden for zonen. */
export function isWellInside(speedMps: number, b: Bounds, marginFrac: number): boolean {
  // Ved meget smal tolerance begrænses margenen, så Stabil stadig kan nås.
  const m = Math.min(b.targetMps * marginFrac, Math.max(0, b.maxMps - b.minMps) / 4);
  return speedMps <= b.maxMps - m && speedMps >= b.minMps + m;
}
