import { estimateDistance, estimateDuration, countExpanded, planTotal, WorkoutTemplate } from '../core/plan';
import { AppSettings } from '../core/settings';
import { formatDistance, formatDuration, formatPace } from '../core/units';
import { translate } from '../i18n/strings';

/** Kort beskrivelse af en træning til lister, fx "10,00 km · 6:00 min/km". */
export function describeTemplate(t: WorkoutTemplate, s: AppSettings): string {
  const n = countExpanded(t.items);
  const parts: string[] = [];
  if (t.unit === 'distance') {
    parts.push(formatDistance(t.totalDistanceM ?? planTotal(t.items), s.distanceUnit, s.lang));
    parts.push(`~${formatDuration(estimateDuration(t.items) * 1000)}`);
  } else {
    parts.push(formatDuration(planTotal(t.items) * 1000));
    parts.push(`~${formatDistance(estimateDistance(t.items), s.distanceUnit, s.lang)}`);
  }
  if (n === 1) {
    const first = t.items[0];
    if (first?.type === 'stage') parts.push(formatPace(first.stage.targetMps, s.paceUnit, s.lang));
  } else parts.push(translate(s.lang, 'stagesCount', { n }));
  return parts.join(' · ');
}
