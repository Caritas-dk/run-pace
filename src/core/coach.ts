// K17-K22: pace-coaching. Bygger på et stabiliseret aktuelt tempo, aldrig på gennemsnittet.
import { CoachingSettings } from './settings';
import { Bounds, classify, isWellInside, Zone } from './tolerance';

export type Suppression = 'paused' | 'no_gps' | 'measuring' | 'settling' | 'stage_change' | null;
export type Instruction = 'stable' | 'slow_down' | 'speed_up' | 'none';

export interface CoachInput {
  now: number;
  /** Udjævnet fart eller null (Måler tempo / intet signal). */
  speed: number | null;
  bounds: Bounds;
  suppression: Suppression;
}

export interface CoachOutput {
  zone: Zone | null;
  instruction: Instruction;
  /** Sat, når en korrektionslyd skal afspilles nu. */
  fire: 'fast' | 'slow' | null;
  /** Tid (ms) talt som gyldig coachingtid i denne opdatering og dens zone (K44). */
  valid: { ms: number; zone: Zone } | null;
}

export interface CoachState {
  deviationDir: 'fast' | 'slow' | null;
  deviationSince: number | null;
  stableSince: number | null;
  /** Slutningen af seneste korrektionslyd (K20). */
  lastCueEnd: number | null;
  instruction: Instruction;
  lastTick: number | null;
}

export class Coach {
  s: CoachState = {
    deviationDir: null,
    deviationSince: null,
    stableSince: null,
    lastCueEnd: null,
    instruction: 'none',
    lastTick: null,
  };

  constructor(public cfg: CoachingSettings) {}

  /** Nulstil afvigelse og visning (bruges ved pause, signaltab og etapeskift). */
  resetDeviation() {
    this.s.deviationDir = null;
    this.s.deviationSince = null;
    this.s.stableSince = null;
  }

  /** Registrér, at en korrektionslyd faktisk blev afspillet og hvornår den sluttede. */
  setCueEnd(t: number) {
    this.s.lastCueEnd = t;
  }

  update(inp: CoachInput, cueDurationMs: (dir: 'fast' | 'slow') => number): CoachOutput {
    const prevTick = this.s.lastTick;
    this.s.lastTick = inp.now;
    const dt = prevTick == null ? 0 : Math.max(0, Math.min(5000, inp.now - prevTick));

    if (inp.suppression || inp.speed == null) {
      // K22: ingen tempoalarmer. Afvigelse tælles ikke under undertrykkelse.
      this.resetDeviation();
      if (inp.suppression === 'paused' || inp.suppression === 'no_gps' || inp.speed == null) this.s.instruction = 'none';
      const zone = inp.speed == null ? null : classify(inp.speed, inp.bounds);
      return { zone, instruction: this.s.instruction, fire: null, valid: null };
    }

    const zone = classify(inp.speed, inp.bounds);
    const out: CoachOutput = { zone, instruction: this.s.instruction, fire: null, valid: dt > 0 ? { ms: dt, zone } : null };

    if (zone === 'in') {
      // K21: nulstil afvigelsestælleren, når tempoet kommer inden for grænserne.
      this.s.deviationDir = null;
      this.s.deviationSince = null;
      if (isWellInside(inp.speed, inp.bounds, this.cfg.stableMarginFrac)) {
        if (this.s.stableSince == null) this.s.stableSince = inp.now;
        if (inp.now - this.s.stableSince >= this.cfg.stableSec * 1000) this.s.instruction = 'stable';
      } else {
        this.s.stableSince = null;
      }
    } else {
      this.s.stableSince = null;
      if (this.s.deviationDir !== zone) {
        this.s.deviationDir = zone;
        this.s.deviationSince = inp.now;
      }
      const lasted = inp.now - (this.s.deviationSince as number);
      if (lasted >= this.cfg.deviationSec * 1000) {
        this.s.instruction = zone === 'fast' ? 'slow_down' : 'speed_up';
        const cooldownOk =
          this.s.lastCueEnd == null || inp.now - this.s.lastCueEnd >= this.cfg.cooldownSec * 1000;
        if (cooldownOk) {
          out.fire = zone;
          // Minimumstiden måles fra slutningen af lyden (K20). Gamle alarmer lægges ikke i kø.
          this.s.lastCueEnd = inp.now + cueDurationMs(zone);
        }
      }
    }
    out.instruction = this.s.instruction;
    return out;
  }

  toJSON(): CoachState {
    return { ...this.s };
  }

  static fromJSON(j: CoachState, cfg: CoachingSettings): Coach {
    const c = new Coach(cfg);
    c.s = { ...j };
    return c;
  }
}
