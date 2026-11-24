// Accepttest A06-A13 og A16-A20 med kontrollerede målesignaler.
import { describe, expect, it } from 'vitest';
import { Coach } from '../src/core/coach';
import { DEFAULT_COACHING, SOUND_DURATION_MS } from '../src/core/settings';
import { computeBounds } from '../src/core/tolerance';
import { SessionEngine } from '../src/core/session';
import { buildResult, learning } from '../src/core/stats';
import { engineFor, paceMps, Runner, stage, T0, template } from './helpers';

const target = paceMps(6, 0);
const bounds = computeBounds({ kind: 'seconds', per: 'km', faster: 10, slower: 10 }, target);
const FAST = paceMps(5, 45);
const SLOW = paceMps(6, 20);
const dur = () => 500;

/** Driver coachen direkte med én stabiliseret måling pr. sekund. */
function drive(c: Coach, start: number, seq: number[]) {
  const fires: { t: number; dir: string }[] = [];
  seq.forEach((v, i) => {
    const now = start + i * 1000;
    const o = c.update({ now, speed: v, bounds, suppression: null }, dur);
    if (o.fire) fires.push({ t: now, dir: o.fire });
  });
  return fires;
}
const rep = (v: number, n: number) => Array(n).fill(v);

describe('Coach (stabiliserede målinger)', () => {
  it('A06 For hurtigt: 5:45 i 5 sekunder giver præcis den valgte For hurtigt-lyd', () => {
    const c = new Coach(DEFAULT_COACHING);
    const fires = drive(c, 0, [...rep(target, 3), ...rep(FAST, 7)]);
    expect(fires).toEqual([{ t: 8000, dir: 'fast' }]); // afvigelse fra t=3 s, kravet opfyldt ved t=8 s
    expect(c.s.instruction).toBe('slow_down');
  });
  it('A07 For langsomt: 6:20 i 5 sekunder giver For langsomt-lyden', () => {
    const c = new Coach(DEFAULT_COACHING);
    const fires = drive(c, 0, [...rep(SLOW, 6)]);
    expect(fires).toEqual([{ t: 5000, dir: 'slow' }]);
    expect(c.s.instruction).toBe('speed_up');
  });
  it('A08 Kort udsving: 3 sekunders afvigelse giver intet bip', () => {
    const c = new Coach(DEFAULT_COACHING);
    expect(drive(c, 0, [...rep(target, 2), ...rep(FAST, 3), ...rep(target, 20)])).toEqual([]);
  });
  it('A09 Ventetid: intet nyt bip før 30 s efter sidste bips slutning', () => {
    const c = new Coach(DEFAULT_COACHING);
    const fires = drive(c, 0, rep(FAST, 125));
    expect(fires.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < fires.length; i++) expect(fires[i].t - fires[i - 1].t).toBeGreaterThanOrEqual(30000 + 500);
    expect(fires[0].t).toBe(5000);
    expect(fires[1].t).toBe(36000); // 5 s + 0,5 s lyd + 30 s, første hele sekund derefter
  });
  it('A10 Retningsskift: samme fælles ventetid, ingen gammel alarm i kø', () => {
    const c = new Coach(DEFAULT_COACHING);
    const fires = drive(c, 0, [...rep(FAST, 10), ...rep(SLOW, 60)]);
    expect(fires[0]).toEqual({ t: 5000, dir: 'fast' });
    expect(fires[1].dir).toBe('slow');
    expect(fires[1].t).toBe(36000);
    expect(fires.filter((f) => f.dir === 'fast')).toHaveLength(1);
  });
  it('A11 Tilbage i zone før ventetiden slutter: ingen ny korrektion', () => {
    const c = new Coach(DEFAULT_COACHING);
    const fires = drive(c, 0, [...rep(FAST, 10), ...rep(target, 60)]);
    expect(fires).toHaveLength(1);
    expect(c.s.instruction).toBe('stable');
  });
  it('K21 Stabil kræver 2 s med margen inden for zonen', () => {
    const c = new Coach(DEFAULT_COACHING);
    const nearEdge = bounds.maxMps - target * 0.001; // indenfor, men ikke med 0,5 % margen
    drive(c, 0, rep(nearEdge, 5));
    expect(c.s.instruction).toBe('none');
    drive(c, 5000, rep(target, 3));
    expect(c.s.instruction).toBe('stable');
  });
  it('A20 Statistik: 100 s gyldig coachingtid, heraf 80 s i zonen, giver 80 %', () => {
    const c = new Coach({ ...DEFAULT_COACHING, cooldownSec: 180 });
    let inMs = 0;
    let all = 0;
    [...rep(target, 81), ...rep(FAST, 20)].forEach((v, i) => {
      const o = c.update({ now: i * 1000, speed: v, bounds, suppression: null }, dur);
      if (o.valid) {
        all += o.valid.ms;
        if (o.valid.zone === 'in') inMs += o.valid.ms;
      }
    });
    expect(all).toBe(100000);
    expect((inMs / all) * 100).toBe(80);
  });
});

describe('Session (simulerede GPS-signaler)', () => {
  const timePlan = (min: number) => template('time', [{ type: 'stage', stage: stage(min * 60, target) }]);

  it('A06 via hele kæden: opstart og tilvænning undertrykker; derefter præcis én For hurtigt-lyd', () => {
    const e = engineFor(timePlan(60));
    const r = new Runner(e);
    r.run(14, FAST); // under tilvænning: ingen alarmer
    expect(r.cues()).toHaveLength(0);
    r.run(30, target);
    expect(r.cues()).toHaveLength(0);
    r.run(20, FAST);
    expect(r.cues().map((c) => c.dir)).toEqual(['fast']);
    expect(e.snapshot(r.t).instruction).toBe('slow_down');
  });

  it('K19 viser Måler tempo, indtil vinduet er fyldt', () => {
    const e = engineFor(timePlan(60));
    const r = new Runner(e);
    r.run(5, target);
    expect(e.snapshot(r.t).speed).toBeNull();
    r.run(6, target);
    expect(e.snapshot(r.t).speed).toBeCloseTo(target, 5);
  });

  it('A12 Etapeskift mellem to GPS-punkter: overskud overføres, nyt mål og tilvænning', () => {
    const tpl = template(
      'distance',
      [
        { type: 'stage', stage: stage(1000, paceMps(6, 0)) },
        { type: 'stage', stage: stage(1000, paceMps(5, 0)) },
      ],
      2000
    );
    const e = engineFor(tpl);
    const r = new Runner(e);
    // 3 m/s: 1000 m passeres mellem to punkter (ca. 334 s)
    while (!r.events.some((x) => x.type === 'stage')) r.run(1, 3);
    const st = r.events.find((x) => x.type === 'stage')!;
    expect(st).toBeDefined();
    const snap = e.snapshot(r.t);
    expect(snap.stageIndex).toBe(1);
    expect(snap.stage.targetMps).toBeCloseTo(paceMps(5, 0));
    expect(snap.stageDone).toBeGreaterThan(0); // overskud fra seneste punkt
    expect(snap.stageDone + 1000).toBeCloseTo(snap.distance, 6);
    // Skiftetid er interpoleret og ligger mellem to punkter
    expect((st.t - T0) % 1000).not.toBe(0);
    // Tilvænning efter skift: ingen korrektion de næste 15 s selv ved for langsomt tempo
    const before = r.cues().length;
    r.run(14, 2.5);
    expect(r.cues().length).toBe(before);
    expect(e.snapshot(r.t).suppression).toBe('settling');
  });

  it('A13 Gamle, unøjagtige og hoppende punkter afvises; feedback ophører med forklaring', () => {
    const e = engineFor(timePlan(60));
    const r = new Runner(e);
    r.run(30, target);
    expect(e.snapshot(r.t).gps).toBe('ok');
    const reasons: string[] = [];
    for (let i = 0; i < 8; i++) {
      r.t += 1000;
      const stale = { t: r.t - 6000, lat: r.lat, lon: r.lon, acc: 5, speed: target };
      const inaccurate = { t: r.t, lat: r.lat, lon: r.lon, acc: 40, speed: target };
      e.addPoint(stale, r.t);
      e.addPoint(inaccurate, r.t);
      const pts = e.drain().points;
      reasons.push(...pts.filter((p) => !p.valid).map((p) => p.reason!));
      r.events.push(...e.tick(r.t));
    }
    expect(reasons).toEqual(expect.arrayContaining(['stale', 'inaccurate']));
    const snap = e.snapshot(r.t);
    expect(snap.gps).toBe('lost');
    expect(snap.suppression).toBe('no_gps');
    expect(snap.speed).toBeNull();
    // Hop på 500 m på 1 s afvises
    const e2 = engineFor(timePlan(60));
    const r2 = new Runner(e2);
    r2.run(10, target);
    const jump = { t: r2.t + 1000, lat: r2.lat + 500 / 111194.93, lon: r2.lon, acc: 5, speed: target };
    e2.addPoint(jump, jump.t);
    expect(e2.drain().points.pop()?.reason).toBe('jump');
    // Dublet
    const dup = { t: r2.t, lat: r2.lat, lon: r2.lon, acc: 5, speed: target };
    e2.addPoint(dup, r2.t + 1500);
    expect(e2.drain().points.pop()?.reason).toBe('duplicate');
  });

  it('A16 Pause og total: 10 min løb, 2 min pause, 5 min løb', () => {
    const e = engineFor(timePlan(60));
    const r = new Runner(e);
    r.run(600, target);
    e.pause(r.t);
    const cuesBefore = r.cues().length;
    // Under pausen bevæger løberen sig hurtigt; ingen coaching, ingen distance
    const distBefore = e.track.dist;
    for (let i = 0; i < 120; i++) {
      const p = r.point(FAST);
      r.events.push(...e.addPoint(p, p.t));
      r.events.push(...e.tick(p.t));
    }
    expect(e.track.dist).toBe(distBefore);
    expect(r.cues().length).toBe(cuesBefore);
    e.resume(r.t);
    r.run(300, target);
    e.stop(r.t);
    const res = buildResult(e);
    expect(res.totalMs).toBe(17 * 60000);
    expect(res.activeMs).toBe(15 * 60000);
    expect(res.pauseMs).toBe(2 * 60000);
    expect(res.endReason).toBe('aborted');
  });

  it('A17 GPS-hul på 60 s: tiden fortsætter, ingen opfundet distance og intet bip før genmåling', () => {
    const e = engineFor(timePlan(60));
    const r = new Runner(e);
    r.run(60, target);
    const d0 = e.track.dist;
    const a0 = e.snapshot(r.t).activeMs;
    // Løberen fortsætter, men der kommer ingen punkter i 60 s
    for (let i = 0; i < 60; i++) {
      r.point(SLOW);
      r.events.push(...e.tick(r.t));
    }
    expect(e.snapshot(r.t).activeMs - a0).toBe(60000);
    expect(e.snapshot(r.t).gps).toBe('lost');
    expect(r.events.some((x) => x.type === 'gps_lost')).toBe(true);
    const cuesBefore = r.cues().length;
    r.run(1, SLOW);
    expect(e.track.dist).toBe(d0); // første punkt efter hullet tilføjer ingen distance
    expect(e.track.seg).toBe(1);
    // Ny måling (10 s) + tilvænning (15 s): ingen bip, selvom tempoet er for langsomt
    r.run(24, SLOW);
    expect(r.cues().length).toBe(cuesBefore);
    r.run(12, SLOW);
    expect(r.cues().length).toBe(cuesBefore + 1);
    e.stop(r.t);
    const res = buildResult(e);
    expect(res.distanceUncertain).toBe(true);
    expect(res.stages[0].uncertain).toBe(true);
  });

  it('A18 Mål og stop: én slutregistrering; ingen coaching eller GPS efter slut', () => {
    const tpl = template('distance', [{ type: 'stage', stage: stage(1000, target) }], 1000);
    const e = engineFor(tpl);
    const r = new Runner(e);
    r.run(400, 3);
    const finishes = r.events.filter((x) => x.type === 'finish');
    expect(finishes).toHaveLength(1);
    expect(e.status).toBe('finished');
    expect(e.snapshot(r.t).distance).toBe(1000);
    const after = r.events.length;
    r.run(20, FAST);
    expect(r.events.length).toBe(after);
    expect(e.drain().points.length).toBeLessThanOrEqual(400);
    const res = buildResult(e);
    expect(res.endReason).toBe('completed');
    expect(res.distanceM).toBe(1000);
    // Måletiden er interpoleret til 1000 m ved 3 m/s
    // (distance tælles fra første gyldige punkt efter 1 s)
    expect(res.activeMs).toBeCloseTo(334333, -2);

    const e2 = engineFor(tpl);
    const r2 = new Runner(e2);
    r2.run(100, 3);
    e2.stop(r2.t);
    e2.stop(r2.t + 5000);
    expect(buildResult(e2).endReason).toBe('aborted');
    expect(e2.drain().events.filter((x) => x.kind === 'abort' || x.kind === 'finish')).toHaveLength(1);
  });

  it('A12/K12 tidsetaper skifter på kumulativ aktiv tid og slutter ved sidste grænse', () => {
    const tpl = template('time', [
      { type: 'repeat', id: 'r', times: 3, stages: [stage(60, FAST), stage(30, SLOW)] },
    ]);
    const e = engineFor(tpl);
    const r = new Runner(e);
    r.run(400, target);
    const stages = r.events.filter((x) => x.type === 'stage');
    expect(stages).toHaveLength(5);
    expect(stages.map((s) => s.t - T0)).toEqual([60000, 90000, 150000, 180000, 240000]);
    const fin = r.events.find((x) => x.type === 'finish')!;
    expect(fin.t - T0).toBe(270000);
    expect(buildResult(e).activeMs).toBe(270000);
  });

  it('A19 Gendannelse: tilstand kan gemmes og fortsættes, og hullet mærkes', () => {
    const e = engineFor(timePlan(30));
    const r = new Runner(e);
    r.run(120, target);
    const json = JSON.parse(JSON.stringify(e.toJSON()));
    const restored = SessionEngine.fromJSON(json);
    expect(restored.snapshot(r.t)).toEqual(e.snapshot(r.t));
    // Appen kørte ikke i 30 s
    r.t += 30000;
    restored.recoverResume(r.t);
    r.e = restored;
    r.run(60, target);
    const snap = restored.snapshot(r.t);
    expect(snap.distanceUncertain).toBe(true);
    expect(snap.activeMs).toBe(210000);
    expect(restored.drain().events.some((x) => x.kind === 'recovered_gap')).toBe(true);
  });

  it('K29 tidsopdelt træning uden GPS fortsætter med timer og uden coaching', () => {
    const e = engineFor(timePlan(1), { gpsEnabled: false });
    for (let i = 1; i <= 70; i++) e.tick(T0 + i * 1000);
    const res = buildResult(e);
    expect(res.endReason).toBe('completed');
    expect(res.activeMs).toBe(60000);
    expect(res.avgMps).toBeNull();
    expect(res.share).toBeNull();
  });

  it('K34 stilstand: GPS-støj tilføjer ikke betydelig distance', () => {
    const e = engineFor(timePlan(10));
    const r = new Runner(e);
    let seed = 1;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 2;
    for (let i = 0; i < 300; i++) {
      r.t += 1000;
      const p = { t: r.t, lat: r.lat + (rnd() * 3) / 111194.93, lon: r.lon + (rnd() * 3) / 62000, acc: 10, speed: 0.1 };
      e.addPoint(p, p.t);
    }
    expect(e.track.dist).toBeLessThan(30);
  });

  it('A20 Resultat: tid i målzone kun for gyldig coachingtid, datadækning vises særskilt', () => {
    const e = engineFor(timePlan(60));
    const r = new Runner(e);
    r.run(115, target);
    r.run(30, FAST);
    e.stop(r.t);
    const res = buildResult(e);
    expect(res.coverage).toBeGreaterThan(0.7);
    expect(res.coverage).toBeLessThan(1);
    expect(res.share!.inPct + res.share!.fastPct + res.share!.slowPct).toBeCloseTo(100);
    expect(res.validMs).toBeLessThan(res.activeMs);
    expect(res.coaching.tolerance).toEqual(DEFAULT_COACHING.tolerance);
    expect(SOUND_DURATION_MS[res.feedback.soundFast]).toBeLessThanOrEqual(1500);
  });

  it('K45 læring: sammenlignelige gentagelser og markering af ændrede indstillinger', () => {
    const mk = (cooldown: number, start: number) => {
      const e = engineFor(timePlan(5), { coaching: { ...DEFAULT_COACHING, cooldownSec: cooldown } });
      const r = new Runner(e);
      r.run(310, target);
      const res = buildResult(e);
      return { ...res, id: `s${start}`, startedAt: start };
    };
    const rows = learning([mk(30, 2), mk(30, 1), mk(60, 3)], mk(30, 0).planHash);
    expect(rows.map((x) => x.sessionId)).toEqual(['s1', 's2', 's3']);
    expect(rows.map((x) => x.settingsChanged)).toEqual([false, false, true]);
  });
});
