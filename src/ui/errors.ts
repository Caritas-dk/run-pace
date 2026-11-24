// K11: fejltekster til feltet, der skal ændres.
import { PlanError, PlanUnit } from '../core/plan';
import { AppSettings } from '../core/settings';
import { formatDistance } from '../core/units';
import { StringKey } from '../i18n/strings';

export function planErrorText(
  e: PlanError,
  t: (k: StringKey, p?: Record<string, string | number>) => string,
  s: AppSettings,
  unit: PlanUnit,
  ctx?: { sum?: number; total?: number }
): string {
  switch (e.code) {
    case 'sum_mismatch': {
      const diff = e.value ?? 0;
      const total = ctx?.total ?? 0;
      return t('err_sum_mismatch', {
        sum: formatDistance(total + diff, s.distanceUnit, s.lang),
        total: formatDistance(total, s.distanceUnit, s.lang),
        diff: `${diff > 0 ? '−' : '+'}${formatDistance(Math.abs(diff), s.distanceUnit, s.lang)}`,
      });
    }
    case 'stage_amount':
      return unit === 'time' ? t('err_stage_amount_time') : t('err_stage_amount');
    default:
      return t(`err_${e.code}` as StringKey);
  }
}
