// Foruddefinerede ture (eksemplerne i kravspecifikationen afsnit 3), som kan justeres i længde og tempo.
// Tempoet styres af et grundtempo: hver etape har en fast forskel i sek/km til grundtempoet,
// så alle tempoer flytter sig sammen, når grundtempoet ændres.
import { makeStage, newId, PlanItem, StageDef, WorkoutTemplate } from './plan';

export type PresetKey = 'steady' | 'progressive' | 'long' | 'intervals';

interface PresetStage {
  nameDa: string;
  nameEn: string;
  /** Andel af samlet distance (distance) eller varighed i sekunder (tid). */
  share: number;
  /** Forskel i sekunder pr. km i forhold til grundtempoet (positiv = langsommere). */
  offset: number;
}

export interface PresetDef {
  key: PresetKey;
  nameDa: string;
  nameEn: string;
  unit: 'distance' | 'time';
  /** Standard grundtempo i sekunder pr. km. */
  baseSec: number;
  baseLabelDa: string;
  baseLabelEn: string;
  /** Længde: samlet distance i meter eller antal gentagelser. */
  length: { kind: 'distance'; def: number; min: number; max: number } | { kind: 'repeats'; def: number; min: number; max: number };
  stages?: PresetStage[];
  intervals?: { warmup: PresetStage; work: PresetStage; rest: PresetStage; cooldown: PresetStage };
}

const st = (nameDa: string, nameEn: string, share: number, offset: number): PresetStage => ({ nameDa, nameEn, share, offset });

export const PRESETS: PresetDef[] = [
  {
    key: 'steady',
    nameDa: 'Stabil tur',
    nameEn: 'Steady run',
    unit: 'distance',
    baseSec: 360,
    baseLabelDa: 'Tempo',
    baseLabelEn: 'Pace',
    length: { kind: 'distance', def: 10000, min: 1000, max: 50000 },
    stages: [st('Stabil', 'Steady', 1, 0)],
  },
  {
    key: 'progressive',
    nameDa: 'Progressiv tur',
    nameEn: 'Progressive run',
    unit: 'distance',
    baseSec: 360,
    baseLabelDa: 'Grundtempo (hovedtur)',
    baseLabelEn: 'Base pace (main part)',
    length: { kind: 'distance', def: 13000, min: 3000, max: 50000 },
    stages: [st('Rolig start', 'Easy start', 3 / 13, 30), st('Hovedtur', 'Main part', 7 / 13, 0), st('Afslutning', 'Finish', 3 / 13, -20)],
  },
  {
    key: 'long',
    nameDa: 'Lang tur',
    nameEn: 'Long run',
    unit: 'distance',
    baseSec: 370,
    baseLabelDa: 'Grundtempo (lang del)',
    baseLabelEn: 'Base pace (long part)',
    length: { kind: 'distance', def: 17000, min: 5000, max: 50000 },
    stages: [st('Opvarmning', 'Warm-up', 2 / 17, 35), st('Lang del', 'Long part', 13 / 17, 0), st('Nedløb', 'Cool-down', 2 / 17, 30)],
  },
  {
    key: 'intervals',
    nameDa: 'Intervaller',
    nameEn: 'Intervals',
    unit: 'time',
    baseSec: 330,
    baseLabelDa: 'Grundtempo (hurtige intervaller)',
    baseLabelEn: 'Base pace (fast intervals)',
    length: { kind: 'repeats', def: 6, min: 1, max: 20 },
    intervals: {
      warmup: st('Opvarmning', 'Warm-up', 600, 75),
      work: st('Hurtig', 'Fast', 180, 0),
      rest: st('Rolig', 'Easy', 120, 90),
      cooldown: st('Nedkøling', 'Cool-down', 300, 90),
    },
  },
];

export function getPreset(key: string): PresetDef | undefined {
  return PRESETS.find((p) => p.key === key);
}

function stage(p: PresetStage, lang: 'da' | 'en', amount: number, baseSec: number): StageDef {
  return makeStage(lang === 'da' ? p.nameDa : p.nameEn, amount, 1000 / (baseSec + p.offset));
}

/** Fordeler en samlet distance på andele i hele 10 m; sidste etape tager resten, så summen er præcis. */
export function splitDistance(total: number, shares: number[]): number[] {
  const sumShares = shares.reduce((a, b) => a + b, 0);
  const out = shares.map((s) => Math.max(10, Math.round((total * (s / sumShares)) / 10) * 10));
  const diff = total - out.reduce((a, b) => a + b, 0);
  out[out.length - 1] += diff;
  return out;
}

export interface PresetOptions {
  baseSec: number;
  /** Meter (distance) eller antal gentagelser. */
  length: number;
  lang: 'da' | 'en';
  /** Valgfrie varigheder i sekunder for intervaltræningen. */
  workSec?: number;
  restSec?: number;
}

export function buildPreset(def: PresetDef, o: PresetOptions, now: number): WorkoutTemplate {
  const name = o.lang === 'da' ? def.nameDa : def.nameEn;
  let items: PlanItem[];
  let totalDistanceM: number | undefined;
  if (def.unit === 'distance' && def.stages) {
    const amounts = splitDistance(o.length, def.stages.map((s) => s.share));
    items = def.stages.map((s, i) => ({ type: 'stage', stage: stage(s, o.lang, amounts[i], o.baseSec) }));
    totalDistanceM = o.length;
  } else {
    const iv = def.intervals!;
    items = [
      { type: 'stage', stage: stage(iv.warmup, o.lang, iv.warmup.share, o.baseSec) },
      {
        type: 'repeat',
        id: newId('rep'),
        times: o.length,
        stages: [stage(iv.work, o.lang, o.workSec ?? iv.work.share, o.baseSec), stage(iv.rest, o.lang, o.restSec ?? iv.rest.share, o.baseSec)],
      },
      { type: 'stage', stage: stage(iv.cooldown, o.lang, iv.cooldown.share, o.baseSec) },
    ];
  }
  return {
    id: newId('tpl'),
    name,
    unit: def.unit,
    totalDistanceM,
    items,
    favorite: false,
    createdAt: now,
    updatedAt: now,
    quick: true,
  };
}

// ---------- justering af enhver træning, også egne ----------

function mapStages(items: PlanItem[], f: (s: StageDef) => StageDef): PlanItem[] {
  return items.map((it) => (it.type === 'stage' ? { ...it, stage: f(it.stage) } : { ...it, stages: it.stages.map(f) }));
}

/** Flytter alle tempoer med samme antal sekunder pr. km (negativ = hurtigere). Forskellene bevares. */
export function shiftPaces(items: PlanItem[], deltaSecPerKm: number): PlanItem[] {
  return mapStages(items, (s) => ({ ...s, targetMps: 1000 / (1000 / s.targetMps + deltaSecPerKm) }));
}

/** Skalerer distanceetaper til en ny samlet distance, så summen præcis passer (hele 10 m). */
export function scaleDistance(items: PlanItem[], newTotal: number): PlanItem[] {
  const flat: number[] = [];
  items.forEach((it) => (it.type === 'stage' ? flat.push(it.stage.amount) : it.stages.forEach((s) => flat.push(s.amount * it.times))));
  const old = flat.reduce((a, b) => a + b, 0);
  if (!(old > 0)) return items;
  const f = newTotal / old;
  const scaled = mapStages(items, (s) => ({ ...s, amount: Math.max(10, Math.round((s.amount * f) / 10) * 10) }));
  // Ret afrundingen på den længste enkeltetape uden for gentagelser.
  let sum = 0;
  scaled.forEach((it) => (sum += it.type === 'stage' ? it.stage.amount : it.stages.reduce((a, s) => a + s.amount, 0) * it.times));
  const diff = newTotal - sum;
  let best = -1;
  scaled.forEach((it, i) => {
    if (it.type === 'stage' && (best < 0 || it.stage.amount > (scaled[best] as { stage: StageDef }).stage.amount)) best = i;
  });
  if (best >= 0 && diff !== 0) {
    const it = scaled[best] as { type: 'stage'; stage: StageDef };
    scaled[best] = { ...it, stage: { ...it.stage, amount: it.stage.amount + diff } };
  }
  return scaled;
}
