// Accepttest A01-A05 og afledte beregningsregler.
import { describe, expect, it } from 'vitest';
import { computeBounds, classify, validateTolerance } from '../src/core/tolerance';
import {
  formatPace,
  fromMps,
  kmhToMps,
  parseDecimal,
  parseMinSec,
  toMeters,
  toMps,
  isValidTargetMps,
} from '../src/core/units';
import { estimateDistance, freezePlan, planTotal, validateTemplate, countExpanded } from '../src/core/plan';
import { paceMps, stage, template } from './helpers';

describe('A01 Enheder', () => {
  it('10 km/t vises korrekt i alle fire enheder, og den interne værdi ændres ikke', () => {
    const mps = toMps(10, 'kmh');
    expect(formatPace(mps, 'kmh', 'da')).toBe('10,00 km/t');
    expect(formatPace(mps, 'minkm', 'da')).toBe('6:00 min/km');
    expect(formatPace(mps, 'mph', 'da')).toBe('6,21 mph');
    expect(formatPace(mps, 'minmi', 'da')).toBe('9:39 min/mile');
    // Visning ændrer ikke værdien
    expect(mps).toBe(kmhToMps(10));
    // Rundtur gennem enheder bevarer værdien
    for (const u of ['kmh', 'mph', 'minkm', 'minmi'] as const) expect(toMps(fromMps(mps, u), u)).toBeCloseTo(mps, 12);
  });
  it('afviser nul og negative værdier og tempo uden for 1-30 km/t', () => {
    expect(toMps(0, 'kmh')).toBeNaN();
    expect(toMps(-5, 'minkm')).toBeNaN();
    expect(isValidTargetMps(toMps(0.5, 'kmh'))).toBe(false);
    expect(isValidTargetMps(toMps(30, 'kmh'))).toBe(true);
    expect(isValidTargetMps(toMps(31, 'kmh'))).toBe(false);
  });
  it('parser felter for minutter og sekunder samt decimaltal', () => {
    expect(parseMinSec('6', '00')).toBe(360);
    expect(parseMinSec('5', '60')).toBeNaN();
    expect(parseDecimal('10,5')).toBe(10.5);
    expect(parseDecimal('abc')).toBeNaN();
  });
});

describe('A02 Distancer', () => {
  it('10, 13, 17 og 50 km kan gemmes; 50,01 km afvises', () => {
    for (const km of [10, 13, 17, 50]) {
      const t = template('distance', [{ type: 'stage', stage: stage(km * 1000, paceMps(6, 0)) }], km * 1000);
      expect(validateTemplate(t)).toEqual([]);
      expect(freezePlan(t).total).toBe(km * 1000);
    }
    const bad = template('distance', [{ type: 'stage', stage: stage(50010, paceMps(6, 0)) }], 50010);
    expect(validateTemplate(bad).map((e) => e.code)).toContain('total_range');
  });
  it('grænsen kontrolleres i meter før visningsafrunding ved miles', () => {
    const m = toMeters(31.07, 'mi'); // 50.002 m: vises som 50,00 km men skal afvises
    const t = template('distance', [{ type: 'stage', stage: stage(m, paceMps(6, 0)) }], m);
    expect(validateTemplate(t).map((e) => e.code)).toContain('total_range');
  });
  it('0,10 km er mindste distance', () => {
    const ok = template('distance', [{ type: 'stage', stage: stage(100, paceMps(6, 0)) }], 100);
    expect(validateTemplate(ok)).toEqual([]);
    const no = template('distance', [{ type: 'stage', stage: stage(90, paceMps(6, 0)) }], 90);
    expect(validateTemplate(no).map((e) => e.code)).toContain('total_range');
  });
});

describe('A03 Etapesum', () => {
  it('13 km med etaper på 3, 7 og 2 km giver fejl på 1 km', () => {
    const t = template(
      'distance',
      [
        { type: 'stage', stage: stage(3000, paceMps(6, 30)) },
        { type: 'stage', stage: stage(7000, paceMps(6, 0)) },
        { type: 'stage', stage: stage(2000, paceMps(5, 40)) },
      ],
      13000
    );
    const errs = validateTemplate(t);
    const mismatch = errs.find((e) => e.code === 'sum_mismatch');
    expect(mismatch?.value).toBe(-1000);
    expect(mismatch?.field).toBe('total');
  });
});

describe('A04 Gentagelser', () => {
  it('tidseksemplet giver 45 minutter, og hver gentagelse udføres én gang', () => {
    const t = template('time', [
      { type: 'stage', stage: stage(600, paceMps(6, 45), 'Opvarmning') },
      {
        type: 'repeat',
        id: 'r',
        times: 6,
        stages: [stage(180, paceMps(5, 30), 'Hurtig'), stage(120, paceMps(7, 0), 'Rolig')],
      },
      { type: 'stage', stage: stage(300, paceMps(7, 0), 'Nedkøling') },
    ]);
    expect(validateTemplate(t)).toEqual([]);
    expect(planTotal(t.items)).toBe(45 * 60);
    expect(countExpanded(t.items)).toBe(14);
    const p = freezePlan(t);
    expect(p.stages.filter((s) => s.name === 'Hurtig')).toHaveLength(6);
    expect(p.stages[p.stages.length - 1].cumEnd).toBe(2700);
    expect(estimateDistance(t.items)).toBeGreaterThan(0);
  });
  it('afviser mere end 200 udfoldede etaper og over 12 timer', () => {
    const many = template('time', [{ type: 'repeat', id: 'r', times: 101, stages: [stage(5, 3), stage(5, 3)] }]);
    expect(validateTemplate(many).map((e) => e.code)).toEqual(expect.arrayContaining(['repeat_times', 'too_many_stages']));
    const long = template('time', [{ type: 'stage', stage: stage(12 * 3600 + 1, 1) }]);
    expect(validateTemplate(long).map((e) => e.code)).toContain('stage_amount');
  });
  it('afviser et distanceestimat over 50 km', () => {
    const t = template('time', [{ type: 'stage', stage: stage(6 * 3600, kmhToMps(10)) }]);
    expect(validateTemplate(t).map((e) => e.code)).toContain('estimate_too_long');
  });
});

describe('A05 Grænser og K18 tolerance', () => {
  const target = paceMps(6, 0);
  const b = computeBounds({ kind: 'seconds', per: 'km', faster: 10, slower: 10 }, target);
  it('5:50 og 6:10 er indenfor, grænserne inklusive', () => {
    expect(classify(paceMps(5, 50), b)).toBe('in');
    expect(classify(paceMps(6, 10), b)).toBe('in');
    expect(classify(paceMps(6, 0), b)).toBe('in');
  });
  it('5:45 er for hurtigt og 6:20 for langsomt', () => {
    expect(classify(paceMps(5, 45), b)).toBe('fast');
    expect(classify(paceMps(6, 20), b)).toBe('slow');
  });
  it('procent- og farttolerance samt asymmetriske grænser', () => {
    const p = computeBounds({ kind: 'percent', faster: 5, slower: 10 }, 3);
    expect(p.maxMps).toBeCloseTo(3.15);
    expect(p.minMps).toBeCloseTo(2.7);
    const s = computeBounds({ kind: 'speed', fasterMps: kmhToMps(0.5), slowerMps: kmhToMps(1) }, kmhToMps(10));
    expect(s.maxMps).toBeCloseTo(kmhToMps(10.5));
    expect(s.minMps).toBeCloseTo(kmhToMps(9));
  });
  it('sekundtolerance skal give positive grænser og procent under 100', () => {
    expect(validateTolerance({ kind: 'seconds', per: 'km', faster: 400, slower: 10 }, target)).toBe('pace_not_positive');
    expect(validateTolerance({ kind: 'percent', faster: 5, slower: 100 }, target)).toBe('percent_too_high');
    expect(validateTolerance({ kind: 'speed', fasterMps: 1, slowerMps: 5 }, target)).toBe('speed_not_positive');
  });
});
