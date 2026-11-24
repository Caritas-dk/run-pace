// K03: Hurtig start med ét tempo og en distance eller varighed.
import { router, Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { PlanUnit, quickTemplate, validateTemplate } from '../core/plan';
import { formatDistance, formatPace, toMps } from '../core/units';
import * as db from '../storage/db';
import { useApp } from '../ui/AppContext';
import { Button, Card, Field, Screen, Segmented, T, Toggle } from '../ui/components';
import { planErrorText } from '../ui/errors';
import { DistanceInput, DurationInput, PaceInput } from '../ui/inputs';

export default function Quick() {
  const { t, settings } = useApp();
  const [unit, setUnit] = useState<PlanUnit>('distance');
  const [meters, setMeters] = useState(5000);
  const [seconds, setSeconds] = useState(30 * 60);
  const [mps, setMps] = useState(toMps(360, 'minkm'));
  const [save, setSave] = useState(false);
  const [name, setName] = useState('');

  const tpl = useMemo(() => {
    const amount = unit === 'distance' ? meters : seconds;
    const label =
      save && name.trim()
        ? name.trim()
        : `${t('quickName')} ${unit === 'distance' ? formatDistance(meters, settings.distanceUnit, settings.lang) : ''} ${formatPace(mps, settings.paceUnit, settings.lang)}`.replace(/\s+/g, ' ');
    return quickTemplate(label, unit, amount, mps, 0);
  }, [unit, meters, seconds, mps, save, name, settings, t]);

  const errors = validateTemplate(tpl);
  const err = (field: string) => {
    const e = errors.find((x) => x.field === field || x.field.startsWith(field));
    return e ? planErrorText(e, t, settings, unit) : null;
  };

  const go = async () => {
    if (errors.length) return;
    const now = Date.now();
    const final = { ...tpl, quick: !save, createdAt: now, updatedAt: now };
    await db.saveTemplate(final);
    router.push({ pathname: '/ready', params: { id: final.id } });
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: t('quickStart') }} />
      <Segmented
        label={t('quickStart')}
        value={unit}
        onChange={setUnit}
        options={[
          { value: 'distance', label: t('distance') },
          { value: 'time', label: t('duration') },
        ]}
      />
      <Card>
        {unit === 'distance' ? (
          <DistanceInput label={t('distance')} meters={meters} onChange={setMeters} unit={settings.distanceUnit} error={err('total') ?? err('items.0.stage.amount')} />
        ) : (
          <DurationInput label={t('duration')} seconds={seconds} onChange={setSeconds} error={err('items.0.stage.amount') ?? err('total')} />
        )}
        <PaceInput label={t('targetPace')} valueMps={mps} onChange={setMps} error={err('items.0.stage.targetMps')} />
      </Card>
      <Card>
        <Toggle label={t('saveAsWorkout')} value={save} onChange={setSave} />
        {save ? <Field label={t('workoutName')} value={name} onChangeText={setName} maxLength={60} /> : null}
      </Card>
      {errors.length ? <T variant="small">{t('fixBeforeStart')}</T> : null}
      <Button big variant="accent" label={t('readyToStart')} icon="chevronRight" disabled={errors.length > 0 || (save && !name.trim())} onPress={go} />
    </Screen>
  );
}
