// K12-K16, K22, K29-K37, K43-K46: træningssession som deterministisk tilstandsmaskine.
// Al tid angives som væg-ur i ms. Motoren kender ikke til lyd, GPS-API eller lager;
// den modtager punkter og tidsimpulser og returnerer hændelser.
import { Coach, CoachState, Instruction, Suppression } from './coach';
import { DEFAULT_FILTER, FilterConfig, GpsTrack, RawPoint, RejectReason, SpeedWindow } from './gps';
import { ExpandedStage, FrozenPlan } from './plan';
import { CoachingSettings, FeedbackSettings, SOUND_DURATION_MS } from './settings';
import { Bounds, computeBounds, Zone } from './tolerance';
import { DistanceUnit, unitMeters } from './units';

export type SessionStatus = 'running' | 'paused' | 'finished';
export type EndReason = 'completed' | 'aborted';
export type GpsState = 'ok' | 'lost' | 'never' | 'disabled';

export interface SessionConfig {
  id: string;
  plan: FrozenPlan;
  coaching: CoachingSettings;
  feedback: FeedbackSettings;
  filter?: FilterConfig;
  splitUnit: DistanceUnit;
  /** K29: tidsopdelt træning kan startes uden GPS. */
  gpsEnabled: boolean;
}

export type LogKind =
  | 'start'
  | 'cue_fast'
  | 'cue_slow'
  | 'stage'
  | 'gps_lost'
  | 'gps_regained'
  | 'pause'
  | 'resume'
  | 'recovered_gap'
  | 'finish'
  | 'abort';

export interface LogEvent {
  t: number;
  activeMs: number;
  stage: number;
  kind: LogKind;
  speed?: number | null;
}

export interface StoredPoint extends RawPoint {
  valid: boolean;
  reason?: RejectReason;
  seg: number;
  dist: number;
}

export interface PaceSample {
  /** Aktiv tid i ms. */
  a: number;
  v: number | null;
  target: number;
  stage: number;
}

export interface Split {
  index: number; // 1 = første km/mile
  activeMs: number; // aktiv tid ved passage
  durationMs: number;
  uncertain: boolean;
}

export interface ZoneTotals {
  in: number;
  fast: number;
  slow: number;
}

export interface StageRun {
  index: number;
  startWall: number;
  startActive: number;
  startDist: number;
  endWall?: number;
  endActive?: number;
  endDist?: number;
  zone: ZoneTotals;
  cues: { fast: number; slow: number };
  uncertain: boolean;
  completed: boolean;
}

export type EngineEvent =
  | { type: 'cue'; dir: 'fast' | 'slow'; t: number }
  | { type: 'stage'; index: number; t: number }
  | { type: 'finish'; reason: EndReason; t: number }
  | { type: 'gps_lost'; t: number }
  | { type: 'gps_regained'; t: number };

export interface Snapshot {
  status: SessionStatus;
  endReason?: EndReason;
  now: number;
  totalMs: number;
  activeMs: number;
  pauseMs: number;
  distance: number;
  stageIndex: number;
  stageCount: number;
  stage: ExpandedStage;
  /** Meter eller ms tilbage af etapen. */
  stageRemaining: number;
  stageDone: number;
  speed: number | null;
  zone: Zone | null;
  instruction: Instruction;
  suppression: Suppression;
  gps: GpsState;
  bounds: Bounds;
  distanceUncertain: boolean;
  avgMps: number | null;
}

const SAMPLE_EVERY_MS = 5000;

export class SessionEngine {
  cfg: SessionConfig;
  status: SessionStatus = 'running';
  endReason?: EndReason;
  startedAt: number;
  endedAt?: number;
  pauseStart: number | null = null;
  pausedMs = 0;
  pauses: { start: number; end: number }[] = [];
  stageIndex = 0;
  stages: StageRun[] = [];
  track: GpsTrack;
  window: SpeedWindow;
  coach: Coach;
  gps: GpsState;
  settleUntil: number;
  awaitSettleAfterWindow = false;
  distanceUncertain = false;
  zone: ZoneTotals = { in: 0, fast: 0, slow: 0 };
  validMs = 0;
  splits: Split[] = [];
  lastSampleAt = -Infinity;
  lastSpeed: number | null = null;
  lastFixAt = -Infinity;
  lastZone: Zone | null = null;
  lastSuppression: Suppression = 'measuring';
  finalDistance?: number;

  // Udbakker, som tømmes af den kaldende tjeneste og skrives til lager.
  outPoints: StoredPoint[] = [];
  outEvents: LogEvent[] = [];
  outSamples: PaceSample[] = [];

  constructor(cfg: SessionConfig, startAt: number) {
    this.cfg = cfg;
    this.startedAt = startAt;
    this.track = new GpsTrack(cfg.filter ?? DEFAULT_FILTER);
    this.window = new SpeedWindow(cfg.coaching.windowSec);
    this.coach = new Coach(cfg.coaching);
    this.gps = cfg.gpsEnabled ? 'never' : 'disabled';
    this.settleUntil = startAt + cfg.coaching.settleSec * 1000;
    this.stages.push(this.newStageRun(0, startAt, 0, 0));
    this.log('start', startAt);
  }

  // ---------- tid ----------

  activeAt(wall: number): number {
    const openPause = this.pauseStart != null ? Math.max(0, wall - this.pauseStart) : 0;
    return Math.max(0, wall - this.startedAt - this.pausedMs - openPause);
  }

  pauseMsAt(wall: number): number {
    return this.pausedMs + (this.pauseStart != null ? Math.max(0, wall - this.pauseStart) : 0);
  }

  get plan() {
    return this.cfg.plan;
  }

  get stage(): ExpandedStage {
    return this.plan.stages[Math.min(this.stageIndex, this.plan.stages.length - 1)];
  }

  boundsFor(stage: ExpandedStage): Bounds {
    return computeBounds(stage.tolerance ?? this.cfg.coaching.tolerance, stage.targetMps);
  }

  private newStageRun(index: number, wall: number, active: number, dist: number): StageRun {
    return {
      index,
      startWall: wall,
      startActive: active,
      startDist: dist,
      zone: { in: 0, fast: 0, slow: 0 },
      cues: { fast: 0, slow: 0 },
      uncertain: false,
      completed: false,
    };
  }

  private log(kind: LogKind, t: number, speed?: number | null) {
    this.outEvents.push({ t, activeMs: this.activeAt(t), stage: this.stageIndex, kind, speed });
  }

  private cueDuration = (dir: 'fast' | 'slow') =>
    SOUND_DURATION_MS[dir === 'fast' ? this.cfg.feedback.soundFast : this.cfg.feedback.soundSlow];

  // ---------- etaper og afslutning ----------

  private advanceStage(atWall: number, events: EngineEvent[]) {
    const run = this.stages[this.stageIndex];
    run.endWall = atWall;
    run.endActive = this.activeAt(atWall);
    run.endDist = this.plan.unit === 'distance' ? this.stage.cumEnd : this.track.dist;
    run.completed = true;
    this.stageIndex += 1;
    const startDist = this.plan.unit === 'distance' ? this.plan.stages[this.stageIndex - 1].cumEnd : this.track.dist;
    this.stages.push(this.newStageRun(this.stageIndex, atWall, run.endActive, startDist));
    // K22: etapeskift har prioritet; afvigelse nulstilles, og en fortrængt korrektion kasseres.
    this.coach.resetDeviation();
    this.coach.s.instruction = 'none';
    this.settleUntil = Math.max(this.settleUntil, atWall + this.cfg.coaching.settleSec * 1000);
    this.log('stage', atWall);
    events.push({ type: 'stage', index: this.stageIndex, t: atWall });
  }

  private finish(atWall: number, reason: EndReason, events: EngineEvent[]) {
    if (this.status === 'finished') return;
    if (this.pauseStart != null) {
      this.pausedMs += Math.max(0, atWall - this.pauseStart);
      this.pauses.push({ start: this.pauseStart, end: atWall });
      this.pauseStart = null;
    }
    const run = this.stages[this.stageIndex];
    run.endWall = atWall;
    run.endActive = this.activeAt(atWall);
    run.completed = reason === 'completed';
    if (reason === 'completed' && this.plan.unit === 'distance') {
      // K14: overskydende målepunkter tæller ikke som ekstra træning.
      this.finalDistance = this.plan.total;
      run.endDist = this.plan.total;
    } else {
      this.finalDistance = this.track.dist;
      run.endDist = this.track.dist;
    }
    this.status = 'finished';
    this.endReason = reason;
    this.endedAt = atWall;
    this.log(reason === 'completed' ? 'finish' : 'abort', atWall);
    events.push({ type: 'finish', reason, t: atWall });
  }

  /** Tidsopdelte etaper skifter på aktiv tid (K35). */
  private advanceTime(now: number, events: EngineEvent[]) {
    if (this.status !== 'running' || this.plan.unit !== 'time') return;
    let active = this.activeAt(now);
    while (this.status === 'running' && active >= this.stage.cumEnd * 1000) {
      // Grænsens væg-tid: ingen pause mellem grænse og nu, når status er running.
      const boundaryWall = now - (active - this.stage.cumEnd * 1000);
      if (this.stageIndex >= this.plan.stages.length - 1) this.finish(boundaryWall, 'completed', events);
      else this.advanceStage(boundaryWall, events);
      active = this.activeAt(now);
    }
  }

  // ---------- input ----------

  addPoint(p: RawPoint, now: number): EngineEvent[] {
    const events: EngineEvent[] = [];
    if (this.status !== 'running' || this.gps === 'disabled') return events;
    // Tidsgrænser kontrolleres først, så punkter efter slut ikke tæller (K14).
    this.advanceTime(Math.min(now, Math.max(p.t, this.startedAt)), events);
    if (this.status !== 'running') return events;

    const prev = this.track.last;
    const prevDist = this.track.dist;
    const res = this.track.add(p, now);
    this.outPoints.push({
      ...p,
      valid: res.accepted,
      reason: res.reason,
      seg: this.track.seg,
      dist: this.track.dist,
    });
    if (!res.accepted || !res.point) return events;

    this.lastFixAt = p.t;
    if (res.gap && this.gps !== 'lost') {
      // Hul opdaget først ved næste punkt (fx når appen kun vækkes af GPS i baggrunden).
      this.markLost(Math.min(p.t, (prev?.t ?? p.t) + this.track.cfg.lostAfterMs), events);
    }
    if (this.gps === 'lost') {
      this.log('gps_regained', p.t);
      events.push({ type: 'gps_regained', t: p.t });
      // K33: nyt vindue og tilvænning før coaching genoptages.
      this.awaitSettleAfterWindow = true;
    }
    this.gps = 'ok';
    this.window.push(res.point);

    // Kilometer/mile-split (K43), interpoleret mellem gyldige punkter.
    if (res.added > 0 && prev) this.recordSplits(prevDist, res.point.dist, prev.t, p.t);

    // Distanceopdelte etaper (K12): kumulative grænser og interpoleret skiftetid.
    if (this.plan.unit === 'distance' && res.added > 0 && prev) {
      while (this.status === 'running' && this.track.dist >= this.stage.cumEnd) {
        const f = (this.stage.cumEnd - prevDist) / (this.track.dist - prevDist);
        const tc = prev.t + Math.max(0, Math.min(1, f)) * (p.t - prev.t);
        if (this.stageIndex >= this.plan.stages.length - 1) this.finish(tc, 'completed', events);
        else this.advanceStage(tc, events);
      }
    }
    events.push(...this.tick(now));
    return events;
  }

  private recordSplits(d0: number, d1: number, t0: number, t1: number) {
    const U = unitMeters(this.cfg.splitUnit);
    let next = (this.splits.length + 1) * U;
    const cap = this.plan.unit === 'distance' ? this.plan.total : Infinity;
    while (next <= d1 && next <= cap) {
      const f = (next - d0) / (d1 - d0);
      const tc = t0 + Math.max(0, Math.min(1, f)) * (t1 - t0);
      const a = this.activeAt(tc);
      const prevA = this.splits.length ? this.splits[this.splits.length - 1].activeMs : 0;
      const prevGaps = this.splits.length ? this.splitGapMark : 0;
      this.splits.push({
        index: this.splits.length + 1,
        activeMs: a,
        durationMs: a - prevA,
        uncertain: this.track.gaps > prevGaps,
      });
      this.splitGapMark = this.track.gaps;
      next = (this.splits.length + 1) * U;
    }
  }
  splitGapMark = 0;

  tick(now: number): EngineEvent[] {
    const events: EngineEvent[] = [];
    if (this.status !== 'running') return events;
    this.advanceTime(now, events);
    if (this.status !== 'running') return events;

    if (this.gps === 'ok' && now - this.lastFixAt > this.track.cfg.lostAfterMs) this.markLost(now, events);

    const speed = this.gps === 'ok' ? this.window.speed(now, this.cfg.filter?.maxAgeMs ?? DEFAULT_FILTER.maxAgeMs) : null;
    if (this.awaitSettleAfterWindow && speed != null) {
      this.awaitSettleAfterWindow = false;
      this.settleUntil = Math.max(this.settleUntil, now + this.cfg.coaching.settleSec * 1000);
    }
    let suppression: Suppression = null;
    if (this.gps !== 'ok') suppression = 'no_gps';
    else if (speed == null || this.awaitSettleAfterWindow) suppression = 'measuring';
    else if (now < this.settleUntil) suppression = 'settling';

    const bounds = this.boundsFor(this.stage);
    const out = this.coach.update({ now, speed, bounds, suppression }, this.cueDuration);
    if (out.valid) {
      this.validMs += out.valid.ms;
      this.zone[out.valid.zone] += out.valid.ms;
      this.stages[this.stageIndex].zone[out.valid.zone] += out.valid.ms;
    }
    if (out.fire) {
      this.stages[this.stageIndex].cues[out.fire] += 1;
      this.log(out.fire === 'fast' ? 'cue_fast' : 'cue_slow', now, speed);
      events.push({ type: 'cue', dir: out.fire, t: now });
    }
    this.lastSpeed = speed;
    this.lastZone = out.zone;
    this.lastSuppression = suppression;

    const a = this.activeAt(now);
    if (a - this.lastSampleAt >= SAMPLE_EVERY_MS) {
      this.lastSampleAt = a;
      this.outSamples.push({ a, v: speed, target: this.stage.targetMps, stage: this.stageIndex });
    }
    return events;
  }

  /** K32: GPS usikker – stands pace-feedback; distance opfindes ikke. */
  private markLost(at: number, events: EngineEvent[]) {
    this.gps = 'lost';
    this.distanceUncertain = true;
    this.stages[this.stageIndex].uncertain = true;
    this.track.breakSegment('gap');
    this.window.reset();
    this.coach.resetDeviation();
    this.log('gps_lost', at);
    events.push({ type: 'gps_lost', t: at });
  }

  /** Lyden blev ikke afspillet (fx under opkald): ventetiden regnes fra nu (K28, ingen kø). */
  cueSkipped(now: number) {
    this.coach.setCueEnd(now);
  }

  pause(now: number) {
    if (this.status !== 'running') return;
    const ev: EngineEvent[] = [];
    this.advanceTime(now, ev);
    if (this.status !== 'running') return;
    this.status = 'paused';
    this.pauseStart = now;
    this.coach.resetDeviation();
    this.coach.s.instruction = 'none';
    this.log('pause', now);
  }

  resume(now: number) {
    if (this.status !== 'paused' || this.pauseStart == null) return;
    this.pausedMs += Math.max(0, now - this.pauseStart);
    this.pauses.push({ start: this.pauseStart, end: now });
    this.pauseStart = null;
    this.status = 'running';
    // Ingen distance hen over pausen; nyt udjævningsvindue.
    this.track.breakSegment('pause');
    this.window.reset();
    this.lastFixAt = Math.max(this.lastFixAt, now);
    this.coach.s.lastTick = now;
    this.log('resume', now);
  }

  /** K16: brugeren afslutter før målet. */
  stop(now: number): EngineEvent[] {
    const events: EngineEvent[] = [];
    if (this.status === 'finished') return events;
    if (this.status === 'running') this.advanceTime(now, events);
    if ((this.status as SessionStatus) !== 'finished') this.finish(now, 'aborted', events);
    return events;
  }

  /** K37: genoptag efter nedbrud med markeret registreringshul. */
  recoverResume(now: number) {
    this.track.breakSegment('gap');
    this.lastFixAt = now;
    this.window.reset();
    this.distanceUncertain = true;
    this.stages[this.stageIndex].uncertain = true;
    if (this.gps === 'ok') this.gps = 'lost';
    this.awaitSettleAfterWindow = true;
    this.coach.resetDeviation();
    this.coach.s.lastTick = now;
    this.log('recovered_gap', now);
  }

  snapshot(now: number): Snapshot {
    const end = this.status === 'finished' && this.endedAt != null ? this.endedAt : now;
    const active = this.activeAt(end);
    const dist = this.status === 'finished' && this.finalDistance != null ? this.finalDistance : this.track.dist;
    const st = this.stage;
    const run = this.stages[this.stageIndex];
    let done: number;
    let remaining: number;
    if (this.plan.unit === 'distance') {
      done = Math.max(0, dist - st.cumStart);
      remaining = Math.max(0, st.cumEnd - dist);
    } else {
      done = Math.max(0, active - run.startActive);
      remaining = Math.max(0, st.cumEnd * 1000 - active);
    }
    return {
      status: this.status,
      endReason: this.endReason,
      now,
      totalMs: Math.max(0, end - this.startedAt),
      activeMs: active,
      pauseMs: this.pauseMsAt(end),
      distance: dist,
      stageIndex: this.stageIndex,
      stageCount: this.plan.stages.length,
      stage: st,
      stageRemaining: remaining,
      stageDone: done,
      speed: this.status === 'running' ? this.lastSpeed : null,
      zone: this.status === 'running' ? this.lastZone : null,
      instruction: this.status === 'running' ? this.coach.s.instruction : 'none',
      suppression: this.status === 'paused' ? 'paused' : this.lastSuppression,
      gps: this.gps,
      bounds: this.boundsFor(st),
      distanceUncertain: this.distanceUncertain,
      avgMps: dist > 0 && active > 0 ? dist / (active / 1000) : null,
    };
  }

  drain() {
    const out = { points: this.outPoints, events: this.outEvents, samples: this.outSamples };
    this.outPoints = [];
    this.outEvents = [];
    this.outSamples = [];
    return out;
  }

  toJSON() {
    return {
      v: 1,
      cfg: this.cfg,
      status: this.status,
      endReason: this.endReason,
      startedAt: this.startedAt,
      endedAt: this.endedAt,
      pauseStart: this.pauseStart,
      pausedMs: this.pausedMs,
      pauses: this.pauses,
      stageIndex: this.stageIndex,
      stages: this.stages,
      track: this.track.toJSON(),
      windowPoints: this.window.points,
      coach: this.coach.toJSON(),
      gps: this.gps,
      settleUntil: this.settleUntil,
      awaitSettleAfterWindow: this.awaitSettleAfterWindow,
      distanceUncertain: this.distanceUncertain,
      zone: this.zone,
      validMs: this.validMs,
      splits: this.splits,
      splitGapMark: this.splitGapMark,
      lastSampleAt: Number.isFinite(this.lastSampleAt) ? this.lastSampleAt : null,
      lastFixAt: Number.isFinite(this.lastFixAt) ? this.lastFixAt : null,
      lastSpeed: this.lastSpeed,
      lastZone: this.lastZone,
      lastSuppression: this.lastSuppression,
      finalDistance: this.finalDistance,
    };
  }

  static fromJSON(j: ReturnType<SessionEngine['toJSON']>): SessionEngine {
    if (!j || j.v !== 1) throw new Error('Ukendt sessionsformat');
    const e = new SessionEngine(j.cfg, j.startedAt);
    e.outEvents = [];
    e.status = j.status;
    e.endReason = j.endReason;
    e.endedAt = j.endedAt;
    e.pauseStart = j.pauseStart;
    e.pausedMs = j.pausedMs;
    e.pauses = j.pauses;
    e.stageIndex = j.stageIndex;
    e.stages = j.stages;
    e.track = GpsTrack.fromJSON(j.track, j.cfg.filter ?? DEFAULT_FILTER);
    e.window.points = j.windowPoints ?? [];
    e.coach = Coach.fromJSON(j.coach as CoachState, j.cfg.coaching);
    e.gps = j.gps;
    e.settleUntil = j.settleUntil;
    e.awaitSettleAfterWindow = j.awaitSettleAfterWindow;
    e.distanceUncertain = j.distanceUncertain;
    e.zone = j.zone;
    e.validMs = j.validMs;
    e.splits = j.splits;
    e.splitGapMark = j.splitGapMark ?? 0;
    e.lastSampleAt = j.lastSampleAt ?? -Infinity;
    e.lastFixAt = j.lastFixAt ?? -Infinity;
    e.lastSpeed = j.lastSpeed ?? null;
    e.lastZone = j.lastZone ?? null;
    e.lastSuppression = j.lastSuppression !== undefined ? j.lastSuppression : 'measuring';
    e.finalDistance = j.finalDistance;
    return e;
  }
}
