// K43: tempo over tid med det gældende måltempo samt ruten tegnet uden kortfliser (virker offline).
import { View } from 'react-native';
import Svg, { G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { PaceSample } from '../core/session';
import { formatDuration, formatPaceValue, Lang, PaceUnit } from '../core/units';
import { colors } from './theme';

export function PaceChart({
  samples,
  unit,
  lang,
  width,
  height = 200,
  label,
}: {
  samples: PaceSample[];
  unit: PaceUnit;
  lang: Lang;
  width: number;
  height?: number;
  label: string;
}) {
  if (samples.length < 2 || width <= 0) return null;
  const padL = 52;
  const padR = 8;
  const padT = 8;
  const padB = 24;
  const W = width - padL - padR;
  const H = height - padT - padB;
  const tMax = samples[samples.length - 1].a || 1;
  const vals = samples.flatMap((s) => [s.v ?? NaN, s.target]).filter((x) => Number.isFinite(x)) as number[];
  let vMin = Math.min(...vals);
  let vMax = Math.max(...vals);
  const pad = Math.max(0.15, (vMax - vMin) * 0.15);
  vMin = Math.max(0.3, vMin - pad);
  vMax = vMax + pad;
  const x = (a: number) => padL + (a / tMax) * W;
  const y = (v: number) => padT + H - ((v - vMin) / (vMax - vMin)) * H;

  // Faktisk tempo med huller, hvor der ikke var gyldige målinger
  let d = '';
  let pen = false;
  for (const s of samples) {
    if (s.v == null) {
      pen = false;
      continue;
    }
    d += `${pen ? 'L' : 'M'}${x(s.a).toFixed(1)},${y(s.v).toFixed(1)}`;
    pen = true;
  }
  // Måltempo som trappekurve
  let tgt = '';
  samples.forEach((s, i) => {
    const px = x(s.a);
    const py = y(s.target);
    if (i === 0) tgt += `M${px},${py}`;
    else tgt += `H${px}V${py}`;
  });
  const ticks = [vMin, (vMin + vMax) / 2, vMax];

  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label}>
      <Svg width={width} height={height}>
        <Rect x={padL} y={padT} width={W} height={H} fill={colors.surface} />
        {ticks.map((v, i) => (
          <G key={i}>
            <Line x1={padL} x2={padL + W} y1={y(v)} y2={y(v)} stroke={colors.border} strokeWidth={1} />
            <SvgText x={padL - 6} y={y(v) + 4} fontSize={11} fill={colors.textMuted} textAnchor="end">
              {formatPaceValue(v, unit, lang)}
            </SvgText>
          </G>
        ))}
        <Path d={tgt} stroke={colors.black} strokeWidth={2} strokeDasharray="6,4" fill="none" />
        <Path d={d} stroke={colors.blue} strokeWidth={2.5} fill="none" />
        <SvgText x={padL} y={height - 6} fontSize={11} fill={colors.textMuted}>
          0:00
        </SvgText>
        <SvgText x={padL + W} y={height - 6} fontSize={11} fill={colors.textMuted} textAnchor="end">
          {formatDuration(tMax)}
        </SvgText>
      </Svg>
    </View>
  );
}

export function RouteView({
  points,
  width,
  height = 220,
  label,
}: {
  points: { lat: number; lon: number; seg: number }[];
  width: number;
  height?: number;
  label: string;
}) {
  if (points.length < 2 || width <= 0) return null;
  const lat0 = points.reduce((a, p) => a + p.lat, 0) / points.length;
  const kx = Math.cos((lat0 * Math.PI) / 180);
  const xs = points.map((p) => p.lon * kx);
  const ys = points.map((p) => p.lat);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const pad = 12;
  const s = Math.min((width - 2 * pad) / (maxX - minX || 1e-9), (height - 2 * pad) / (maxY - minY || 1e-9));
  const offX = (width - (maxX - minX) * s) / 2;
  const offY = (height - (maxY - minY) * s) / 2;
  let d = '';
  let prevSeg = -1;
  points.forEach((p, i) => {
    const px = offX + (xs[i] - minX) * s;
    const py = height - (offY + (ys[i] - minY) * s);
    // Nyt segment = hul i ruten (K32); der tegnes ingen linje hen over hullet.
    d += `${p.seg !== prevSeg ? 'M' : 'L'}${px.toFixed(1)},${py.toFixed(1)}`;
    prevSeg = p.seg;
  });
  const first = points[0];
  const last = points[points.length - 1];
  const fx = offX + (first.lon * kx - minX) * s;
  const fy = height - (offY + (first.lat - minY) * s);
  const lx = offX + (last.lon * kx - minX) * s;
  const ly = height - (offY + (last.lat - minY) * s);
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label}>
      <Svg width={width} height={height}>
        <Rect x={0} y={0} width={width} height={height} rx={12} fill={colors.blueLight} />
        <Path d={d} stroke={colors.blue} strokeWidth={4} fill="none" strokeLinejoin="round" strokeLinecap="round" />
        <Rect x={fx - 6} y={fy - 6} width={12} height={12} rx={6} fill={colors.lime} stroke={colors.black} strokeWidth={2} />
        <Rect x={lx - 6} y={ly - 6} width={12} height={12} rx={2} fill={colors.black} />
      </Svg>
    </View>
  );
}
