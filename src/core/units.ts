// K05/K06: tempoenheder og konvertering.
// Alt beregnes internt i meter, sekunder og m/s. Afrunding sker kun ved visning.

export const METERS_PER_MILE = 1609.344;
export const METERS_PER_KM = 1000;

export type PaceUnit = 'kmh' | 'mph' | 'minkm' | 'minmi';
export type DistanceUnit = 'km' | 'mi';
export type Lang = 'da' | 'en';

export const PACE_UNITS: PaceUnit[] = ['kmh', 'mph', 'minkm', 'minmi'];

/** Standardforslag for gyldigt måltempo (K06): 1-30 km/t. */
export const MIN_TARGET_MPS = 1 / 3.6;
export const MAX_TARGET_MPS = 30 / 3.6;

export function kmhToMps(kmh: number): number {
  return kmh / 3.6;
}
export function mpsToKmh(mps: number): number {
  return mps * 3.6;
}
export function mphToMps(mph: number): number {
  return (mph * METERS_PER_MILE) / 3600;
}
export function mpsToMph(mps: number): number {
  return (mps * 3600) / METERS_PER_MILE;
}
/** Sekunder pr. km/mile -> m/s. */
export function paceToMps(secondsPer: number, unit: DistanceUnit): number {
  return unitMeters(unit) / secondsPer;
}
/** m/s -> sekunder pr. km/mile (urundet). */
export function mpsToPace(mps: number, unit: DistanceUnit): number {
  return unitMeters(unit) / mps;
}

export function unitMeters(unit: DistanceUnit): number {
  return unit === 'km' ? METERS_PER_KM : METERS_PER_MILE;
}

export function paceUnitDistance(unit: PaceUnit): DistanceUnit {
  return unit === 'kmh' || unit === 'minkm' ? 'km' : 'mi';
}

export function isPaceStyle(unit: PaceUnit): boolean {
  return unit === 'minkm' || unit === 'minmi';
}

/** Konverterer en værdi i den valgte enhed til m/s. Pace-enheder angives i sekunder. */
export function toMps(value: number, unit: PaceUnit): number {
  if (!(value > 0) || !Number.isFinite(value)) return NaN;
  switch (unit) {
    case 'kmh':
      return kmhToMps(value);
    case 'mph':
      return mphToMps(value);
    case 'minkm':
      return paceToMps(value, 'km');
    case 'minmi':
      return paceToMps(value, 'mi');
  }
}

/** m/s -> værdi i enheden (km/t, mph eller sekunder pr. km/mile). */
export function fromMps(mps: number, unit: PaceUnit): number {
  switch (unit) {
    case 'kmh':
      return mpsToKmh(mps);
    case 'mph':
      return mpsToMph(mps);
    case 'minkm':
      return mpsToPace(mps, 'km');
    case 'minmi':
      return mpsToPace(mps, 'mi');
  }
}

export function isValidTargetMps(mps: number): boolean {
  // lille margen så grænseværdier indtastet i andre enheder ikke afvises af afrunding
  return Number.isFinite(mps) && mps >= MIN_TARGET_MPS * (1 - 1e-9) && mps <= MAX_TARGET_MPS * (1 + 1e-9);
}

/** Deler sekunder i hele minutter og sekunder afrundet til nærmeste sekund. */
export function splitMinSec(totalSeconds: number): { min: number; sec: number } {
  const rounded = Math.round(totalSeconds);
  return { min: Math.floor(rounded / 60), sec: rounded % 60 };
}

function decimalSep(lang: Lang): string {
  return lang === 'da' ? ',' : '.';
}

export function formatNumber(value: number, decimals: number, lang: Lang): string {
  const s = value.toFixed(decimals);
  const [int, frac] = s.split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, lang === 'da' ? '.' : ',');
  return frac ? `${grouped}${decimalSep(lang)}${frac}` : grouped;
}

export function paceUnitLabel(unit: PaceUnit, lang: Lang): string {
  switch (unit) {
    case 'kmh':
      return lang === 'da' ? 'km/t' : 'km/h';
    case 'mph':
      return 'mph';
    case 'minkm':
      return 'min/km';
    case 'minmi':
      return 'min/mile';
  }
}

/** Formaterer kun tallet (uden enhed), fx "6:00" eller "10,00". */
export function formatPaceValue(mps: number | null | undefined, unit: PaceUnit, lang: Lang): string {
  if (mps == null || !(mps > 0) || !Number.isFinite(mps)) return '–';
  const v = fromMps(mps, unit);
  if (isPaceStyle(unit)) {
    if (v >= 100 * 60) return '–';
    const { min, sec } = splitMinSec(v);
    return `${min}:${sec.toString().padStart(2, '0')}`;
  }
  return formatNumber(v, 2, lang);
}

export function formatPace(mps: number | null | undefined, unit: PaceUnit, lang: Lang): string {
  return `${formatPaceValue(mps, unit, lang)} ${paceUnitLabel(unit, lang)}`;
}

export function formatDistance(meters: number, unit: DistanceUnit, lang: Lang, decimals = 2): string {
  const v = meters / unitMeters(unit);
  return `${formatNumber(v, decimals, lang)} ${unit === 'km' ? 'km' : lang === 'da' ? 'mi' : 'mi'}`;
}

/** h:mm:ss eller m:ss. */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) ms = 0;
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = s.toString().padStart(2, '0');
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${ss}`;
  return `${m}:${ss}`;
}

/** Parser decimaltal med komma eller punktum. Returnerer NaN ved ugyldig værdi. */
export function parseDecimal(text: string): number {
  const t = text.trim().replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(t) && !/^\d*\.\d+$/.test(t)) return NaN;
  return Number(t);
}

/** Parser separate minut- og sekundfelter (K05). Sekunder skal være 0-59. */
export function parseMinSec(minText: string, secText: string): number {
  const m = minText.trim() === '' ? 0 : Number(minText.trim());
  const s = secText.trim() === '' ? 0 : Number(secText.trim());
  if (!Number.isInteger(m) || !Number.isInteger(s) || m < 0 || s < 0 || s > 59) return NaN;
  const total = m * 60 + s;
  return total > 0 ? total : NaN;
}

/** Afstand i en visningsenhed -> meter. */
export function toMeters(value: number, unit: DistanceUnit): number {
  return value * unitMeters(unit);
}
