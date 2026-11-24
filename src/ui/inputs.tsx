// K05: indtastning i fire tempoenheder med separate felter for minutter og sekunder.
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { computeBounds, ToleranceSpec, validateTolerance } from '../core/tolerance';
import {
  DistanceUnit,
  formatNumber,
  formatPace,
  fromMps,
  isPaceStyle,
  isValidTargetMps,
  kmhToMps,
  mphToMps,
  mpsToKmh,
  mpsToMph,
  PaceUnit,
  paceUnitLabel,
  parseDecimal,
  parseMinSec,
  splitMinSec,
  toMps,
  unitMeters,
} from '../core/units';
import { useApp } from './AppContext';
import { FieldError, Segmented, T } from './components';
import { colors, fonts, radius, space, TOUCH } from './theme';

function NumBox({
  value,
  onChangeText,
  label,
  width = 72,
  decimal,
  error,
}: {
  value: string;
  onChangeText: (s: string) => void;
  label: string;
  width?: number;
  decimal?: boolean;
  error?: boolean;
}) {
  return (
    <TextInput
      accessibilityLabel={label}
      value={value}
      onChangeText={onChangeText}
      keyboardType={decimal ? 'decimal-pad' : 'number-pad'}
      selectTextOnFocus
      style={[styles.box, { width }, error && { borderColor: colors.danger, borderWidth: 2 }]}
      maxLength={decimal ? 6 : 3}
    />
  );
}

function paceTexts(mps: number, unit: PaceUnit, lang: 'da' | 'en') {
  if (!(mps > 0)) return { a: '', b: '' };
  if (isPaceStyle(unit)) {
    const { min, sec } = splitMinSec(fromMps(mps, unit));
    return { a: String(min), b: sec.toString().padStart(2, '0') };
  }
  return { a: formatNumber(fromMps(mps, unit), 2, lang), b: '' };
}

export function PaceInput({
  label,
  valueMps,
  onChange,
  showUnitSwitch = true,
  error,
}: {
  label: string;
  valueMps: number;
  onChange: (mps: number) => void;
  showUnitSwitch?: boolean;
  error?: string | null;
}) {
  const { settings, t } = useApp();
  const [unit, setUnitState] = useState<PaceUnit>(settings.paceUnit);
  const init = paceTexts(valueMps, unit, settings.lang);
  const [a, setA] = useState(init.a);
  const [b, setB] = useState(init.b);
  const lastEmitted = useRef(valueMps);

  // Enhedsskift: vis samme gemte værdi i den nye enhed; den gemte værdi ændres ikke (K06).
  const setUnit = (u: PaceUnit) => {
    const x = paceTexts(valueMps, u, settings.lang);
    setA(x.a);
    setB(x.b);
    lastEmitted.current = valueMps;
    setUnitState(u);
  };

  useEffect(() => {
    if (valueMps !== lastEmitted.current) {
      const x = paceTexts(valueMps, unit, settings.lang);
      setA(x.a);
      setB(x.b);
      lastEmitted.current = valueMps;
    }
  }, [valueMps, unit, settings.lang]);

  const emit = (na: string, nb: string) => {
    let mps: number;
    if (isPaceStyle(unit)) mps = toMps(parseMinSec(na, nb), unit);
    else mps = toMps(parseDecimal(na), unit);
    lastEmitted.current = mps;
    onChange(mps);
  };

  const invalid = !(valueMps > 0) || !isValidTargetMps(valueMps);
  const other: PaceUnit = unit === 'minkm' ? 'kmh' : unit === 'kmh' ? 'minkm' : unit === 'mph' ? 'minmi' : 'mph';

  return (
    <View style={{ gap: space.s }}>
      <T variant="label">{label}</T>
      <View style={styles.row}>
        {isPaceStyle(unit) ? (
          <>
            <NumBox label={`${label}, ${t('minutes')}`} value={a} error={!!error} onChangeText={(s) => { setA(s); emit(s, b); }} />
            <T style={styles.sep}>:</T>
            <NumBox label={`${label}, ${t('seconds')}`} value={b} error={!!error} onChangeText={(s) => { setB(s); emit(a, s); }} />
          </>
        ) : (
          <NumBox label={label} value={a} decimal width={110} error={!!error} onChangeText={(s) => { setA(s); emit(s, ''); }} />
        )}
        <T style={styles.unit}>{paceUnitLabel(unit, settings.lang)}</T>
      </View>
      {!invalid ? (
        <T variant="small">= {formatPace(valueMps, other, settings.lang)}</T>
      ) : null}
      {showUnitSwitch ? (
        <Segmented
          label={t('paceUnit')}
          value={unit}
          onChange={setUnit}
          options={(['minkm', 'kmh', 'minmi', 'mph'] as PaceUnit[]).map((u) => ({ value: u, label: paceUnitLabel(u, settings.lang) }))}
        />
      ) : null}
      {error ? <FieldError text={error} /> : null}
    </View>
  );
}

/** Distance i km eller miles med 0,01 i trin (K07). Returnerer meter. */
export function DistanceInput({
  label,
  meters,
  onChange,
  unit,
  error,
}: {
  label: string;
  meters: number;
  onChange: (m: number) => void;
  unit: DistanceUnit;
  error?: string | null;
}) {
  const { settings } = useApp();
  const fmt = (m: number) => {
    if (!(m > 0)) return '';
    const s = (m / unitMeters(unit)).toFixed(2);
    return settings.lang === 'da' ? s.replace('.', ',') : s;
  };
  const [text, setText] = useState(fmt(meters));
  const last = useRef(meters);
  useEffect(() => {
    if (meters !== last.current) {
      setText(fmt(meters));
      last.current = meters;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meters, unit]);
  return (
    <View style={{ gap: space.s }}>
      <T variant="label">{label}</T>
      <View style={styles.row}>
        <NumBox
          label={label}
          value={text}
          decimal
          width={120}
          error={!!error}
          onChangeText={(s) => {
            setText(s);
            const v = parseDecimal(s);
            // Hundrededele: afrund til 0,01 enhed. I km giver det hele 10 m.
            const m = Number.isFinite(v) ? Math.round(v * 100) * (unitMeters(unit) / 100) : NaN;
            last.current = m;
            onChange(unit === 'km' ? Math.round(m) : m);
          }}
        />
        <T style={styles.unit}>{unit === 'km' ? 'km' : 'mi'}</T>
      </View>
      {error ? <FieldError text={error} /> : null}
    </View>
  );
}

/** Varighed med separate felter for timer, minutter og sekunder. */
export function DurationInput({
  label,
  seconds,
  onChange,
  error,
}: {
  label: string;
  seconds: number;
  onChange: (s: number) => void;
  error?: string | null;
}) {
  const { t } = useApp();
  const split = (s: number) => ({
    h: s >= 3600 ? String(Math.floor(s / 3600)) : '',
    m: s > 0 ? String(Math.floor((s % 3600) / 60)) : '',
    s: s > 0 ? String(Math.floor(s % 60)).padStart(2, '0') : '',
  });
  const [v, setV] = useState(split(seconds));
  const last = useRef(seconds);
  useEffect(() => {
    if (seconds !== last.current) {
      setV(split(seconds));
      last.current = seconds;
    }
  }, [seconds]);
  const emit = (n: { h: string; m: string; s: string }) => {
    setV(n);
    const toInt = (x: string) => (x.trim() === '' ? 0 : Number(x));
    const h = toInt(n.h);
    const m = toInt(n.m);
    const s = toInt(n.s);
    const ok = [h, m, s].every((x) => Number.isInteger(x) && x >= 0) && s < 60 && m < 60;
    const total = ok ? h * 3600 + m * 60 + s : NaN;
    last.current = total;
    onChange(total);
  };
  return (
    <View style={{ gap: space.s }}>
      <T variant="label">{label}</T>
      <View style={styles.row}>
        <NumBox label={`${label}, ${t('hours')}`} value={v.h} width={56} error={!!error} onChangeText={(h) => emit({ ...v, h })} />
        <T style={styles.unit}>{t('hours')}</T>
        <NumBox label={`${label}, ${t('minutes')}`} value={v.m} width={64} error={!!error} onChangeText={(m) => emit({ ...v, m })} />
        <T style={styles.unit}>{t('minutes')}</T>
        <NumBox label={`${label}, ${t('seconds')}`} value={v.s} width={64} error={!!error} onChangeText={(s) => emit({ ...v, s })} />
        <T style={styles.unit}>{t('seconds')}</T>
      </View>
      {error ? <FieldError text={error} /> : null}
    </View>
  );
}

/** K18: tolerance som sekunder, fart eller procent, med de resulterende grænser vist. */
export function ToleranceEditor({
  value,
  onChange,
  targetMps,
}: {
  value: ToleranceSpec;
  onChange: (t: ToleranceSpec) => void;
  targetMps: number;
}) {
  const { settings, t } = useApp();
  const lang = settings.lang;
  const speedUnit: 'kmh' | 'mph' = settings.distanceUnit === 'mi' ? 'mph' : 'kmh';
  const toSpeedText = (mps: number) => formatNumber(speedUnit === 'kmh' ? mpsToKmh(mps) : mpsToMph(mps), 1, lang);
  const fromSpeedText = (s: string) => {
    const v = parseDecimal(s);
    return speedUnit === 'kmh' ? kmhToMps(v) : mphToMps(v);
  };
  const initTexts = (v: ToleranceSpec) =>
    v.kind === 'speed'
      ? { f: toSpeedText(v.fasterMps), s: toSpeedText(v.slowerMps) }
      : { f: String(v.faster), s: String(v.slower) };
  const [texts, setTexts] = useState(initTexts(value));

  const setKind = (kind: ToleranceSpec['kind']) => {
    let next: ToleranceSpec;
    if (kind === 'seconds') next = { kind, per: settings.distanceUnit, faster: 10, slower: 10 };
    else if (kind === 'speed') next = { kind, fasterMps: kmhToMps(0.5), slowerMps: kmhToMps(0.5) };
    else next = { kind, faster: 3, slower: 3 };
    setTexts(initTexts(next));
    onChange(next);
  };

  const setVal = (which: 'f' | 's', text: string) => {
    const nt = { ...texts, [which]: text };
    setTexts(nt);
    if (value.kind === 'speed') {
      onChange({ kind: 'speed', fasterMps: fromSpeedText(nt.f), slowerMps: fromSpeedText(nt.s) });
    } else if (value.kind === 'seconds') {
      onChange({ ...value, faster: parseDecimal(nt.f), slower: parseDecimal(nt.s) });
    } else {
      onChange({ kind: 'percent', faster: parseDecimal(nt.f), slower: parseDecimal(nt.s) });
    }
  };

  const unitLabel =
    value.kind === 'seconds' ? `${t('seconds')}/${value.per === 'km' ? 'km' : 'mile'}` : value.kind === 'speed' ? paceUnitLabel(speedUnit, lang) : '%';
  const err = validateTolerance(value, targetMps);
  const valid = !err && [texts.f, texts.s].every((x) => Number.isFinite(parseDecimal(x)));
  const b = valid ? computeBounds(value, targetMps) : null;
  const pu = settings.paceUnit;

  return (
    <View style={{ gap: space.s }}>
      <Segmented
        label={t('toleranceType')}
        value={value.kind}
        onChange={setKind}
        options={[
          { value: 'seconds', label: t('tolSeconds') },
          { value: 'speed', label: t('tolSpeed') },
          { value: 'percent', label: t('tolPercent') },
        ]}
      />
      {value.kind === 'seconds' ? (
        <Segmented
          label={t('distanceUnit')}
          value={value.per}
          onChange={(per) => onChange({ ...value, per })}
          options={[
            { value: 'km', label: t('perKm') },
            { value: 'mi', label: t('perMile') },
          ]}
        />
      ) : null}
      <View style={styles.row}>
        <T style={{ width: 120 }}>{t('faster')}</T>
        <NumBox label={`${t('faster')} ${unitLabel}`} value={texts.f} decimal width={88} onChangeText={(s) => setVal('f', s)} />
        <T style={styles.unit}>{unitLabel}</T>
      </View>
      <View style={styles.row}>
        <T style={{ width: 120 }}>{t('slower')}</T>
        <NumBox label={`${t('slower')} ${unitLabel}`} value={texts.s} decimal width={88} onChangeText={(s) => setVal('s', s)} />
        <T style={styles.unit}>{unitLabel}</T>
      </View>
      {b ? (
        <T variant="small">
          {t('resultingBounds', {
            // I tempoenheder er den hurtige grænse det laveste tal
            min: formatPace(isPaceStyle(pu) ? b.maxMps : b.minMps, pu, lang),
            max: formatPace(isPaceStyle(pu) ? b.minMps : b.maxMps, pu, lang),
            target: formatPace(targetMps, pu, lang),
          })}
        </T>
      ) : (
        <FieldError text={t('err_stage_tolerance')} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.s },
  box: {
    minHeight: TOUCH,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.m,
    textAlign: 'center',
    fontFamily: fonts.bold,
    fontSize: 22,
    color: colors.text,
    backgroundColor: colors.white,
  },
  sep: { fontFamily: fonts.bold, fontSize: 22 },
  unit: { color: colors.textMuted },
});
