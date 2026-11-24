// K43-K46: resultat, tid i målzonen, datadækning og læring over tid.
import { ExpandedStage } from './plan';
import { SessionEngine, Split, ZoneTotals, EndReason, PaceSample } from './session';
import { CoachingSettings, FeedbackSettings } from './settings';
import { Bounds } from './tolerance';
import { DistanceUnit } from './units';

export interface StageResult {
  index: number;
  name: string;
  targetMps: number;
  bounds: Bounds;
  plannedAmount: number;
  activeMs: number;
  distanceM: number;
  avgMps: number | null;
  zone: ZoneTotals;
  validMs: number;
  cues: { fast: number; slow: number };
  uncertain: boolean;
  completed: boolean;
}

export interface ZoneShare {
  inPct: number;
  fastPct: number;
  slowPct: number;
}

export interface SessionResult {
  id: string;
  templateId: string;
  templateName: string;
  planHash: string;
  unit: 'distance' | 'time';
  startedAt: number;
  endedAt: number;
  endReason: EndReason;
  totalMs: number;
  activeMs: number;
  pauseMs: number;
  distanceM: number;
  distanceUncertain: boolean;
  avgMps: number | null;
  splitUnit: DistanceUnit;
  splits: Split[];
  stages: StageResult[];
  zone: ZoneTotals;
  validMs: number;
  /** K44: gyldig coachingtid / al aktiv tid. */
  coverage: number | null;
  /** K44: ingen score ved nul gyldig coachingtid. */
  share: ZoneShare | null;
  cues: { fast: number; slow: number };
  /** K46: de faktisk brugte indstillinger. */
  coaching: CoachingSettings;
  feedback: FeedbackSettings;
  gpsEnabled: boolean;
}

export function zoneShare(z: ZoneTotals): ZoneShare | null {
  const total = z.in + z.fast + z.slow;
  if (total <= 0) return null;
  return { inPct: (z.in / total) * 100, fastPct: (z.fast / total) * 100, slowPct: (z.slow / total) * 100 };
}

export function buildResult(e: SessionEngine): SessionResult {
  if (e.status !== 'finished' || e.endedAt == null) throw new Error('Session er ikke afsluttet');
  const snap = e.snapshot(e.endedAt);
  const stages: StageResult[] = e.stages.map((run) => {
    const st: ExpandedStage = e.plan.stages[run.index];
    const activeMs = Math.max(0, (run.endActive ?? snap.activeMs) - run.startActive);
    const distanceM = Math.max(0, (run.endDist ?? snap.distance) - run.startDist);
    const validMs = run.zone.in + run.zone.fast + run.zone.slow;
    return {
      index: run.index,
      name: st.name,
      targetMps: st.targetMps,
      bounds: e.boundsFor(st),
      plannedAmount: st.amount,
      activeMs,
      distanceM,
      avgMps: distanceM > 0 && activeMs > 0 && e.gps !== 'disabled' ? distanceM / (activeMs / 1000) : null,
      zone: { ...run.zone },
      validMs,
      cues: { ...run.cues },
      uncertain: run.uncertain,
      completed: run.completed,
    };
  });
  const cues = stages.reduce((a, s) => ({ fast: a.fast + s.cues.fast, slow: a.slow + s.cues.slow }), { fast: 0, slow: 0 });
  return {
    id: e.cfg.id,
    templateId: e.plan.templateId,
    templateName: e.plan.templateName,
    planHash: e.plan.hash,
    unit: e.plan.unit,
    startedAt: e.startedAt,
    endedAt: e.endedAt,
    endReason: e.endReason ?? 'aborted',
    totalMs: snap.totalMs,
    activeMs: snap.activeMs,
    pauseMs: snap.pauseMs,
    distanceM: snap.distance,
    distanceUncertain: e.distanceUncertain,
    // K35: intet pace ved nul distance.
    avgMps: e.gps === 'disabled' ? null : snap.avgMps,
    splitUnit: e.cfg.splitUnit,
    splits: e.splits,
    stages,
    zone: { ...e.zone },
    validMs: e.validMs,
    coverage: snap.activeMs > 0 ? Math.min(1, e.validMs / snap.activeMs) : null,
    share: zoneShare(e.zone),
    cues,
    coaching: e.cfg.coaching,
    feedback: e.cfg.feedback,
    gpsEnabled: e.cfg.gpsEnabled,
  };
}

/** Kort over tempo over tid til grafen (K43): måltempoet, der gjaldt på samme tidspunkt. */
export function paceSeries(samples: PaceSample[]) {
  return samples.map((s) => ({ t: s.a, v: s.v, target: s.target, stage: s.stage }));
}

export interface LearningRow {
  sessionId: string;
  startedAt: number;
  inPct: number | null;
  coverage: number | null;
  cues: number;
  /** Indstillinger, der påvirker antallet af bip, er ændret i forhold til den første tur. */
  settingsChanged: boolean;
  perStage: { index: number; name: string; inPct: number | null; cues: number }[];
}

function feedbackKey(r: SessionResult) {
  return JSON.stringify([r.coaching.tolerance, r.coaching.cooldownSec, r.coaching.deviationSec, r.coaching.windowSec]);
}

/** K45: udvikling for sammenlignelige gentagelser af samme træning (samme plan-hash). */
export function learning(results: SessionResult[], planHash: string): LearningRow[] {
  const same = results.filter((r) => r.planHash === planHash).sort((a, b) => a.startedAt - b.startedAt);
  if (!same.length) return [];
  const baseKey = feedbackKey(same[0]);
  return same.map((r) => ({
    sessionId: r.id,
    startedAt: r.startedAt,
    inPct: r.share ? r.share.inPct : null,
    coverage: r.coverage,
    cues: r.cues.fast + r.cues.slow,
    settingsChanged: feedbackKey(r) !== baseKey,
    perStage: r.stages.map((s) => ({
      index: s.index,
      name: s.name,
      inPct: zoneShare(s.zone)?.inPct ?? null,
      cues: s.cues.fast + s.cues.slow,
    })),
  }));
}
