// K30-K34: GPS-validering, distance, signaltab og udjævning.

export interface RawPoint {
  /** Tidsstempel for målingen (ms, epoch). */
  t: number;
  lat: number;
  lon: number;
  /** Rapporteret vandret usikkerhed i meter. */
  acc: number | null;
  alt?: number | null;
  /** Rapporteret fart (Doppler) i m/s, hvis tilgængelig. */
  speed?: number | null;
}

export type RejectReason = 'timestamp' | 'duplicate' | 'stale' | 'inaccurate' | 'jump' | 'coords';

export interface FilterConfig {
  /** K31: punkt er ubrugeligt ved usikkerhed over 25 m. */
  maxAccuracyM: number;
  /** K31: punkt er ubrugeligt ved alder over 5 s. */
  maxAgeMs: number;
  /** Usandsynligt spring: fart over denne grænse mellem to punkter. */
  maxSpeedMps: number;
  /** Tid uden gyldige punkter, før signalet regnes som tabt (K32). */
  lostAfterMs: number;
  /** K34: mindste flytning før distance tilføjes ved lav fart (støj ved stilstand). */
  stationarySpeedMps: number;
}

export const DEFAULT_FILTER: FilterConfig = {
  maxAccuracyM: 25,
  maxAgeMs: 5000,
  maxSpeedMps: 12.5,
  lostAfterMs: 5000,
  stationarySpeedMps: 0.5,
};

const R = 6371008.8;
export function haversine(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const toRad = Math.PI / 180;
  const dLat = (bLat - aLat) * toRad;
  const dLon = (bLon - aLon) * toRad;
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos(aLat * toRad) * Math.cos(bLat * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

export interface AcceptedPoint extends RawPoint {
  /** Kumulativ valideret distance ved dette punkt. */
  dist: number;
  /** Rutesegment; nyt segment efter signaltab eller pause (hul i ruten). */
  seg: number;
}

export interface PointResult {
  accepted: boolean;
  reason?: RejectReason;
  /** Distance tilført af dette punkt. */
  added: number;
  /** Segmentet startede efter et hul i data (ikke planlagt pause). */
  gap?: boolean;
  /** Punktet startede et nyt segment efter et hul. */
  newSegment: boolean;
  point?: AcceptedPoint;
}

/**
 * Validerer punkter og akkumulerer distance. Distance beregnes aldrig hen over huller (K32),
 * og små flytninger ved stilstand akkumuleres først, når de overstiger støjgrænsen (K34).
 */
export class GpsTrack {
  cfg: FilterConfig;
  dist = 0;
  seg = 0;
  last: AcceptedPoint | null = null;
  /** Ankerpunkt for distance ved stilstand. */
  anchor: AcceptedPoint | null = null;
  /** Næste punkt starter nyt segment: 'start', 'pause' (planlagt) eller 'gap' (signaltab/nedbrud). */
  breakPending: 'start' | 'pause' | 'gap' | null = 'start';
  gaps = 0;

  constructor(cfg: FilterConfig = DEFAULT_FILTER) {
    this.cfg = cfg;
  }

  /** Tvinger nyt segment ved næste punkt. Kun 'gap' tæller som hul i data. */
  breakSegment(kind: 'pause' | 'gap') {
    if (this.breakPending !== 'gap') this.breakPending = kind;
  }

  validate(p: RawPoint, now: number): RejectReason | null {
    if (!Number.isFinite(p.t) || p.t <= 0 || p.t > now + 2000) return 'timestamp';
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon) || Math.abs(p.lat) > 90 || Math.abs(p.lon) > 180)
      return 'coords';
    if (this.last && p.t <= this.last.t) return 'duplicate';
    if (now - p.t > this.cfg.maxAgeMs) return 'stale';
    if (p.acc == null || !Number.isFinite(p.acc) || p.acc > this.cfg.maxAccuracyM) return 'inaccurate';
    if (this.last && this.breakPending == null && p.t - this.last.t <= this.cfg.lostAfterMs) {
      const d = haversine(this.last.lat, this.last.lon, p.lat, p.lon);
      const dt = (p.t - this.last.t) / 1000;
      // Tillad usikkerheden som ekstra margen, så små hop ved dårlig præcision ikke afvises fejlagtigt.
      const allowance = this.cfg.maxSpeedMps * dt + (p.acc + (this.last.acc ?? 0)) * 0.5;
      if (d > allowance) return 'jump';
    }
    return null;
  }

  add(p: RawPoint, now: number): PointResult {
    const reason = this.validate(p, now);
    if (reason) return { accepted: false, reason, added: 0, newSegment: false };

    let newSegment = false;
    let gap = false;
    let added = 0;
    if (!this.last || this.breakPending || p.t - this.last.t > this.cfg.lostAfterMs) {
      // K32/K33: sammenlign ikke med sidste punkt før hullet.
      if (this.last) {
        this.seg += 1;
        gap = this.breakPending === 'gap' || (this.breakPending == null && p.t - this.last.t > this.cfg.lostAfterMs);
        if (gap) this.gaps += 1;
      }
      newSegment = true;
        this.breakPending = null;
      this.anchor = null;
    } else {
      const anchor = this.anchor ?? this.last;
      const d = haversine(anchor.lat, anchor.lon, p.lat, p.lon);
      const speed = p.speed != null && p.speed >= 0 ? p.speed : null;
      const acc = Math.max(p.acc ?? 0, anchor.acc ?? 0);
      let moving: boolean;
      if (speed == null) moving = d >= Math.min(10, Math.max(3, 0.6 * acc));
      else if (speed >= this.cfg.stationarySpeedMps) moving = true;
      // Lav rapporteret fart: kun reel flytning ud over usikkerheden tæller.
      else moving = d >= Math.max(5, acc);
      if (moving) {
        added = d;
        this.anchor = null;
      } else {
        // Hold ankeret; distancen tælles, når flytningen overstiger støjen.
        this.anchor = anchor;
      }
    }
    this.dist += added;
    const ap: AcceptedPoint = { ...p, dist: this.dist, seg: this.seg };
    this.last = ap;
    return { accepted: true, added, newSegment, gap, point: ap };
  }


  toJSON() {
    return {
      dist: this.dist,
      seg: this.seg,
      last: this.last,
      anchor: this.anchor,
      breakPending: this.breakPending,
      gaps: this.gaps,
    };
  }

  static fromJSON(j: ReturnType<GpsTrack['toJSON']>, cfg: FilterConfig = DEFAULT_FILTER): GpsTrack {
    const g = new GpsTrack(cfg);
    g.dist = j.dist;
    g.seg = j.seg;
    g.last = j.last;
    g.anchor = j.anchor;
    g.breakPending = j.breakPending;
    g.gaps = j.gaps;
    return g;
  }
}

/**
 * K19: udjævnet aktuel fart over et tidsvindue. Kun punkter fra det aktuelle segment bruges.
 * Hvis Doppler-fart findes for de fleste punkter, bruges dens gennemsnit; ellers distance/tid.
 */
export class SpeedWindow {
  points: AcceptedPoint[] = [];
  windowMs: number;

  constructor(windowSec: number) {
    this.windowMs = windowSec * 1000;
  }

  reset() {
    this.points = [];
  }

  push(p: AcceptedPoint) {
    if (this.points.length && this.points[this.points.length - 1].seg !== p.seg) this.points = [];
    this.points.push(p);
    this.trim(p.t);
  }

  private trim(now: number) {
    const cutoff = now - this.windowMs - 1000;
    while (this.points.length > 2 && this.points[0].t < cutoff) this.points.shift();
  }

  /** Udjævnet fart eller null, hvis der ikke er nok gyldige data til det valgte vindue. */
  speed(now: number, maxAgeMs: number): number | null {
    if (!this.points.length) return null;
    const lastP = this.points[this.points.length - 1];
    if (now - lastP.t > maxAgeMs) return null;
    const from = lastP.t - this.windowMs;
    const inWin = this.points.filter((p) => p.t >= from - 500);
    if (inWin.length < 3) return null;
    const span = inWin[inWin.length - 1].t - inWin[0].t;
    if (span < this.windowMs * 0.8) return null;
    const withSpeed = inWin.filter((p) => p.speed != null && p.speed >= 0);
    if (withSpeed.length >= inWin.length * 0.8) {
      return withSpeed.reduce((a, p) => a + (p.speed as number), 0) / withSpeed.length;
    }
    let d = 0;
    for (let i = 1; i < inWin.length; i++)
      d += haversine(inWin[i - 1].lat, inWin[i - 1].lon, inWin[i].lat, inWin[i].lon);
    return d / (span / 1000);
  }
}
