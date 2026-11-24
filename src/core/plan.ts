// K03, K04, K07-K11: træningsskabeloner, etaper, gentagelser og validering.
import { ToleranceSpec, validateTolerance } from './tolerance';
import { isValidTargetMps } from './units';

export type PlanUnit = 'distance' | 'time';

export interface StageDef {
  id: string;
  name: string;
  /** Meter (distance) eller sekunder (tid) afhængigt af planens enhed. */
  amount: number;
  targetMps: number;
  /** Valgfri særlig tolerance for etapen (K09). */
  tolerance?: ToleranceSpec | null;
}

export type PlanItem =
  | { type: 'stage'; stage: StageDef }
  | { type: 'repeat'; id: string; times: number; stages: StageDef[] };

export interface WorkoutTemplate {
  id: string;
  name: string;
  unit: PlanUnit;
  /** K07: valgt samlet distance i meter (kun distanceopdelt). */
  totalDistanceM?: number;
  items: PlanItem[];
  favorite: boolean;
  createdAt: number;
  updatedAt: number;
  /** Hurtig start-træninger vises ikke i biblioteket, medmindre de gemmes. */
  quick?: boolean;
}

export interface ExpandedStage {
  index: number;
  sourceId: string;
  name: string;
  amount: number;
  targetMps: number;
  tolerance: ToleranceSpec | null;
  /** Kumulativ start- og slutgrænse (meter eller sekunder). K12: kumulative grænser. */
  cumStart: number;
  cumEnd: number;
  /** Gentagelsesinfo til visning, fx "2/6". */
  repeat?: { block: string; round: number; of: number };
}

export interface FrozenPlan {
  templateId: string;
  templateName: string;
  unit: PlanUnit;
  stages: ExpandedStage[];
  total: number;
  hash: string;
}

export const LIMITS = {
  minTotalM: 100,
  maxTotalM: 50000,
  stepM: 10,
  minStageSec: 5,
  maxStageSec: 12 * 3600,
  maxTotalSec: 12 * 3600,
  maxEstimateM: 50000,
  maxExpanded: 200,
  maxRepeat: 100,
  minStageM: 10,
};

/** Afstandssum sammenlignes med 0,5 m margen for at tåle flydende tal ved miles. */
const SUM_EPS_M = 0.5;

export function expandItems(items: PlanItem[]): Omit<ExpandedStage, 'index' | 'cumStart' | 'cumEnd'>[] {
  const out: Omit<ExpandedStage, 'index' | 'cumStart' | 'cumEnd'>[] = [];
  for (const it of items) {
    if (it.type === 'stage') {
      out.push({
        sourceId: it.stage.id,
        name: it.stage.name,
        amount: it.stage.amount,
        targetMps: it.stage.targetMps,
        tolerance: it.stage.tolerance ?? null,
      });
    } else {
      const times = Math.max(0, Math.floor(it.times));
      for (let r = 1; r <= times; r++) {
        for (const s of it.stages) {
          out.push({
            sourceId: s.id,
            name: s.name,
            amount: s.amount,
            targetMps: s.targetMps,
            tolerance: s.tolerance ?? null,
            repeat: { block: it.id, round: r, of: times },
          });
        }
        if (out.length > LIMITS.maxExpanded) return out;
      }
    }
  }
  return out;
}

export function countExpanded(items: PlanItem[]): number {
  let n = 0;
  for (const it of items) n += it.type === 'stage' ? 1 : Math.max(0, Math.floor(it.times)) * it.stages.length;
  return n;
}

export function planTotal(items: PlanItem[]): number {
  let t = 0;
  for (const it of items) {
    if (it.type === 'stage') t += it.stage.amount;
    else t += Math.max(0, Math.floor(it.times)) * it.stages.reduce((a, s) => a + s.amount, 0);
  }
  return t;
}

/** K08: forventet distance for tidsopdelt træning. */
export function estimateDistance(items: PlanItem[]): number {
  let d = 0;
  for (const it of items) {
    if (it.type === 'stage') d += it.stage.amount * it.stage.targetMps;
    else d += Math.max(0, Math.floor(it.times)) * it.stages.reduce((a, s) => a + s.amount * s.targetMps, 0);
  }
  return d;
}

/** K11: forventet tid for distanceopdelt træning (sekunder). */
export function estimateDuration(items: PlanItem[]): number {
  let t = 0;
  for (const it of items) {
    if (it.type === 'stage') t += it.stage.amount / it.stage.targetMps;
    else t += Math.max(0, Math.floor(it.times)) * it.stages.reduce((a, s) => a + s.amount / s.targetMps, 0);
  }
  return t;
}

export type PlanErrorCode =
  | 'no_name'
  | 'no_stages'
  | 'total_range'
  | 'sum_mismatch'
  | 'stage_amount'
  | 'stage_target'
  | 'stage_tolerance'
  | 'repeat_times'
  | 'repeat_empty'
  | 'too_many_stages'
  | 'total_time'
  | 'estimate_too_long';

export interface PlanError {
  code: PlanErrorCode;
  /** Feltsti, fx "total", "items.2.stages.1.amount". */
  field: string;
  /** Fx afvigelse i meter for sum_mismatch (positiv = etaper er længere end valgt distance). */
  value?: number;
}

export function validateTemplate(t: Pick<WorkoutTemplate, 'name' | 'unit' | 'items' | 'totalDistanceM'>): PlanError[] {
  const errors: PlanError[] = [];
  if (!t.name || !t.name.trim()) errors.push({ code: 'no_name', field: 'name' });
  if (t.items.length === 0) errors.push({ code: 'no_stages', field: 'items' });

  const checkStage = (s: StageDef, path: string) => {
    if (t.unit === 'distance') {
      if (!(s.amount >= LIMITS.minStageM - 1e-6) || !Number.isFinite(s.amount))
        errors.push({ code: 'stage_amount', field: `${path}.amount` });
    } else if (!(s.amount >= LIMITS.minStageSec && s.amount <= LIMITS.maxStageSec) || !Number.isInteger(s.amount)) {
      errors.push({ code: 'stage_amount', field: `${path}.amount` });
    }
    if (!isValidTargetMps(s.targetMps)) errors.push({ code: 'stage_target', field: `${path}.targetMps` });
    else if (s.tolerance && validateTolerance(s.tolerance, s.targetMps))
      errors.push({ code: 'stage_tolerance', field: `${path}.tolerance` });
  };

  t.items.forEach((it, i) => {
    if (it.type === 'stage') checkStage(it.stage, `items.${i}.stage`);
    else {
      if (!Number.isInteger(it.times) || it.times < 1 || it.times > LIMITS.maxRepeat)
        errors.push({ code: 'repeat_times', field: `items.${i}.times` });
      if (it.stages.length === 0) errors.push({ code: 'repeat_empty', field: `items.${i}.stages` });
      it.stages.forEach((s, j) => checkStage(s, `items.${i}.stages.${j}`));
    }
  });

  if (countExpanded(t.items) > LIMITS.maxExpanded) errors.push({ code: 'too_many_stages', field: 'items' });

  const sum = planTotal(t.items);
  if (t.unit === 'distance') {
    const total = t.totalDistanceM ?? NaN;
    // K07: grænsen på 50.000 m kontrolleres før visningsafrunding.
    if (!(total >= LIMITS.minTotalM - 1e-6 && total <= LIMITS.maxTotalM + 1e-6))
      errors.push({ code: 'total_range', field: 'total' });
    else if (t.items.length > 0 && Math.abs(sum - total) > SUM_EPS_M)
      errors.push({ code: 'sum_mismatch', field: 'total', value: sum - total });
  } else {
    if (sum > LIMITS.maxTotalSec) errors.push({ code: 'total_time', field: 'total' });
    if (estimateDistance(t.items) > LIMITS.maxEstimateM) errors.push({ code: 'estimate_too_long', field: 'total' });
  }
  return errors;
}

function simpleHash(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

/** Struktur-hash til K45: sammenlignelige gentagelser af samme træning. */
export function planHash(unit: PlanUnit, stages: { amount: number; targetMps: number }[]): string {
  return simpleHash(
    unit + '|' + stages.map((s) => `${Math.round(s.amount * 10)}@${Math.round(s.targetMps * 1000)}`).join(',')
  );
}

/** K04: en igangværende træning bruger en fast kopi af planen. */
export function freezePlan(t: WorkoutTemplate): FrozenPlan {
  const raw = expandItems(t.items);
  let cum = 0;
  const stages: ExpandedStage[] = raw.map((s, i) => {
    const st: ExpandedStage = { ...s, index: i, cumStart: cum, cumEnd: cum + s.amount };
    cum += s.amount;
    return st;
  });
  // Distanceplaner slutter præcis ved den valgte distance.
  if (t.unit === 'distance' && stages.length && t.totalDistanceM) stages[stages.length - 1].cumEnd = t.totalDistanceM;
  const total = stages.length ? stages[stages.length - 1].cumEnd : 0;
  return {
    templateId: t.id,
    templateName: t.name,
    unit: t.unit,
    stages: JSON.parse(JSON.stringify(stages)),
    total,
    hash: planHash(t.unit, stages),
  };
}

let idCounter = 0;
export function newId(prefix = 'id'): string {
  idCounter = (idCounter + 1) % 1e6;
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}${idCounter.toString(36)}`;
}

export function deepCopyTemplate(t: WorkoutTemplate, name: string, now: number): WorkoutTemplate {
  const copy: WorkoutTemplate = JSON.parse(JSON.stringify(t));
  copy.id = newId('tpl');
  copy.name = name;
  copy.favorite = false;
  copy.createdAt = now;
  copy.updatedAt = now;
  copy.quick = false;
  for (const it of copy.items) {
    if (it.type === 'stage') it.stage.id = newId('st');
    else {
      it.id = newId('rep');
      it.stages.forEach((s) => (s.id = newId('st')));
    }
  }
  return copy;
}

export function makeStage(name: string, amount: number, targetMps: number): StageDef {
  return { id: newId('st'), name, amount, targetMps, tolerance: null };
}

/** K03: Hurtig start med ét tempo og en distance eller varighed. */
export function quickTemplate(
  name: string,
  unit: PlanUnit,
  amount: number,
  targetMps: number,
  now: number
): WorkoutTemplate {
  return {
    id: newId('tpl'),
    name,
    unit,
    totalDistanceM: unit === 'distance' ? amount : undefined,
    items: [{ type: 'stage', stage: makeStage(name, amount, targetMps) }],
    favorite: false,
    createdAt: now,
    updatedAt: now,
    quick: true,
  };
}

/** Flytter et element i en liste (K09). */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  const copy = list.slice();
  if (from < 0 || from >= copy.length || to < 0 || to >= copy.length) return copy;
  const [x] = copy.splice(from, 1);
  copy.splice(to, 0, x);
  return copy;
}
