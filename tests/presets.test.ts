// Justerbare foruddefinerede ture: længde og grundtempo.
import { describe, expect, it } from 'vitest';
import { countExpanded, freezePlan, planTotal, validateTemplate } from '../src/core/plan';
import { buildPreset, getPreset, PRESETS, scaleDistance, shiftPaces, splitDistance } from '../src/core/presets';

const pace = (mps: number) => Math.round(1000 / mps);

describe('Foruddefinerede ture', () => {
  it('standardudgaverne svarer til eksemplerne i kravspecifikationen og er gyldige', () => {
    for (const def of PRESETS) {
      const t = buildPreset(def, { baseSec: def.baseSec, length: def.length.def, lang: 'da' }, 0);
      expect(validateTemplate(t)).toEqual([]);
    }
    const prog = buildPreset(getPreset('progressive')!, { baseSec: 360, length: 13000, lang: 'da' }, 0);
    const p = freezePlan(prog).stages;
    expect(p.map((s) => s.amount)).toEqual([3000, 7000, 3000]);
    expect(p.map((s) => pace(s.targetMps))).toEqual([390, 360, 340]); // 6:30, 6:00, 5:40
    const iv = buildPreset(getPreset('intervals')!, { baseSec: 330, length: 6, lang: 'da' }, 0);
    expect(planTotal(iv.items)).toBe(45 * 60);
    expect(countExpanded(iv.items)).toBe(14);
    expect(freezePlan(iv).stages.map((s) => pace(s.targetMps)).slice(0, 3)).toEqual([405, 330, 420]); // 6:45, 5:30, 7:00
  });

  it('grundtempoet flytter alle etaper med samme forskel', () => {
    const t = buildPreset(getPreset('progressive')!, { baseSec: 330, length: 13000, lang: 'da' }, 0);
    expect(freezePlan(t).stages.map((s) => pace(s.targetMps))).toEqual([360, 330, 310]);
  });

  it('længden fordeles, så etaperne præcis giver den valgte distance', () => {
    for (const total of [5000, 13010, 21100, 42200, 50000]) {
      const t = buildPreset(getPreset('long')!, { baseSec: 370, length: total, lang: 'da' }, 0);
      expect(planTotal(t.items)).toBe(total);
      expect(validateTemplate(t)).toEqual([]);
    }
    expect(splitDistance(10000, [1, 1, 1])).toEqual([3330, 3330, 3340]);
  });

  it('antal gentagelser ændrer intervaltræningens længde', () => {
    const t = buildPreset(getPreset('intervals')!, { baseSec: 330, length: 10, lang: 'da' }, 0);
    expect(planTotal(t.items)).toBe(600 + 10 * 300 + 300);
  });

  it('egne træninger kan også justeres i tempo og distance', () => {
    const t = buildPreset(getPreset('progressive')!, { baseSec: 360, length: 13000, lang: 'da' }, 0);
    const faster = shiftPaces(t.items, -15);
    expect(freezePlan({ ...t, items: faster }).stages.map((s) => pace(s.targetMps))).toEqual([375, 345, 325]);
    const longer = scaleDistance(t.items, 21100);
    expect(planTotal(longer)).toBe(21100);
    expect(validateTemplate({ ...t, items: longer, totalDistanceM: 21100 })).toEqual([]);
  });
});
