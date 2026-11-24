// Foruddefineret tur, der kan justeres i længde og tempo via et grundtempo.
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { estimateDistance, estimateDuration, freezePlan, planTotal, validateTemplate } from '../core/plan';
import { buildPreset, getPreset } from '../core/presets';
import { formatDistance, formatDuration, formatPace } from '../core/units';
import * as db from '../storage/db';
import { useApp } from '../ui/AppContext';
import { Button, Card, FieldError, Screen, Stepper, T } from '../ui/components';
import { planErrorText } from '../ui/errors';
import { DistanceInput, PaceInput } from '../ui/inputs';
import { fonts, space } from '../ui/theme';

export default function Preset() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const { t, settings } = useApp();
  const def = getPreset(key ?? '');
  const lang = settings.lang;
  const [baseMps, setBaseMps] = useState(def ? 1000 / def.baseSec : 3);
  const [length, setLength] = useState(def?.length.def ?? 10000);
  const [workSec, setWorkSec] = useState(def?.intervals?.work.share ?? 180);
  const [restSec, setRestSec] = useState(def?.intervals?.rest.share ?? 120);

  const tpl = useMemo(
    () => (def ? buildPreset(def, { baseSec: 1000 / baseMps, length, lang, workSec, restSec }, 0) : null),
    [def, baseMps, length, lang, workSec, restSec]
  );
  if (!def || !tpl) return <Screen><T>…</T></Screen>;

  const valid = Number.isFinite(baseMps) && baseMps > 0 && Number.isFinite(length);
  const errors = valid ? validateTemplate(tpl) : [{ code: 'stage_target' as const, field: 'base' }];
  const plan = valid && !errors.length ? freezePlan(tpl) : null;
  const lengthErr = def.length.kind === 'distance' && !(length >= def.length.min && length <= def.length.max);

  const save = async (asMine: boolean) => {
    const now = Date.now();
    const final = { ...tpl, quick: !asMine, createdAt: now, updatedAt: now };
    await db.saveTemplate(final);
    return final.id;
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: lang === 'da' ? def.nameDa : def.nameEn }} />
      <Card>
        <PaceInput label={lang === 'da' ? def.baseLabelDa : def.baseLabelEn} valueMps={baseMps} onChange={setBaseMps} />
        <T variant="small">{t('basePaceNote')}</T>
      </Card>
      <Card>
        {def.length.kind === 'distance' ? (
          <DistanceInput
            label={t('length')}
            meters={length}
            unit={settings.distanceUnit}
            onChange={setLength}
            error={lengthErr ? `${formatDistance(def.length.min, settings.distanceUnit, lang)} – ${formatDistance(def.length.max, settings.distanceUnit, lang)}` : null}
          />
        ) : (
          <>
            <Stepper label={t('repeats')} value={length} min={def.length.min} max={def.length.max} onChange={setLength} format={(n) => t('timesShort', { n })} />
            <Stepper label={t('workPart')} value={workSec} min={15} max={1200} step={15} onChange={setWorkSec} format={(v) => formatDuration(v * 1000)} />
            <Stepper label={t('restPart')} value={restSec} min={15} max={1200} step={15} onChange={setRestSec} format={(v) => formatDuration(v * 1000)} />
          </>
        )}
      </Card>
      <Card>
        <T variant="label">{t('overview')}</T>
        {plan
          ? plan.stages.slice(0, 8).map((s) => (
              <View key={s.index} style={{ flexDirection: 'row', gap: space.s }}>
                <T style={{ flex: 1 }} numberOfLines={1}>
                  {s.name}
                  {s.repeat ? ` (${s.repeat.round}/${s.repeat.of})` : ''}
                </T>
                <T>{tpl.unit === 'distance' ? formatDistance(s.amount, settings.distanceUnit, lang) : formatDuration(s.amount * 1000)}</T>
                <T style={{ fontFamily: fonts.bold, minWidth: 96, textAlign: 'right' }}>{formatPace(s.targetMps, settings.paceUnit, lang)}</T>
              </View>
            ))
          : null}
        {plan && plan.stages.length > 8 ? <T variant="small">… {t('stagesCount', { n: plan.stages.length })}</T> : null}
        {plan ? (
          <T style={{ fontFamily: fonts.semibold }}>
            {tpl.unit === 'distance'
              ? `${formatDistance(planTotal(tpl.items), settings.distanceUnit, lang)} · ${t('expectedFinish')} ${formatDuration(estimateDuration(tpl.items) * 1000)}`
              : `${formatDuration(planTotal(tpl.items) * 1000)} · ${t('expectedDistance')} ${formatDistance(estimateDistance(tpl.items), settings.distanceUnit, lang)}`}
          </T>
        ) : null}
        {valid ? errors.map((e, i) => <FieldError key={i} text={planErrorText(e, t, settings, tpl.unit, { total: tpl.totalDistanceM })} />) : null}
      </Card>
      <Button big variant="accent" icon="play" label={t('readyToStart')} disabled={!plan} onPress={async () => router.push({ pathname: '/ready', params: { id: await save(false) } })} />
      <Button variant="secondary" icon="star" label={t('saveMine')} disabled={!plan} onPress={async () => { await save(true); router.push('/library'); }} />
      <Button variant="ghost" icon="edit" label={t('detailedEdit')} disabled={!plan} onPress={async () => router.push({ pathname: '/builder', params: { id: await save(true) } })} />
    </Screen>
  );
}
