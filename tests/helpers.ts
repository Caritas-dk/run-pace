import { RawPoint } from '../src/core/gps';
import { freezePlan, PlanItem, StageDef, WorkoutTemplate } from '../src/core/plan';
import { SessionConfig, SessionEngine, EngineEvent } from '../src/core/session';
import { DEFAULT_COACHING, DEFAULT_FEEDBACK } from '../src/core/settings';

export const M_PER_DEG_LAT = 111194.93;
export const T0 = 1_800_000_000_000;

export function paceMps(min: number, sec: number) {
  return 1000 / (min * 60 + sec);
}

let n = 0;
export function stage(amount: number, targetMps: number, name = 'Etape'): StageDef {
  return { id: `s${++n}`, name, amount, targetMps, tolerance: null };
}

export function template(unit: 'distance' | 'time', items: PlanItem[], totalDistanceM?: number): WorkoutTemplate {
  return { id: 'tpl', name: 'Test', unit, items, totalDistanceM, favorite: false, createdAt: 0, updatedAt: 0 };
}

export function engineFor(tpl: WorkoutTemplate, overrides: Partial<SessionConfig> = {}): SessionEngine {
  const cfg: SessionConfig = {
    id: 'sess',
    plan: freezePlan(tpl),
    coaching: { ...DEFAULT_COACHING },
    feedback: { ...DEFAULT_FEEDBACK },
    splitUnit: 'km',
    gpsEnabled: true,
    ...overrides,
  };
  return new SessionEngine(cfg, T0);
}

/** Kører simulerede målinger: én pr. sekund med den givne fart (m/s). */
export class Runner {
  lat = 55.86;
  lon = 9.85;
  t: number;
  events: EngineEvent[] = [];
  constructor(public e: SessionEngine, start = T0) {
    this.t = start;
  }
  point(speed: number, acc = 5, dtMs = 1000): RawPoint {
    this.t += dtMs;
    this.lat += (speed * (dtMs / 1000)) / M_PER_DEG_LAT;
    return { t: this.t, lat: this.lat, lon: this.lon, acc, speed };
  }
  run(seconds: number, speed: number, acc = 5) {
    for (let i = 0; i < seconds; i++) {
      const p = this.point(speed, acc);
      this.events.push(...this.e.addPoint(p, p.t));
    }
  }
  /** Tid går uden GPS-punkter. */
  silence(seconds: number) {
    for (let i = 0; i < seconds; i++) {
      this.t += 1000;
      this.events.push(...this.e.tick(this.t));
    }
  }
  cues() {
    return this.events.filter((e) => e.type === 'cue') as Extract<EngineEvent, { type: 'cue' }>[];
  }
}
