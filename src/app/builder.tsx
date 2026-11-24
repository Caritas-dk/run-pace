// K07-K11: træningsbygger med etaper, gentagelser, totaler og fejl ved feltet.
import { router, Stack, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import {
  countExpanded,
  estimateDistance,
  estimateDuration,
  makeStage,
  moveItem,
  newId,
  PlanItem,
  planTotal,
  PlanUnit,
  StageDef,
  validateTemplate,
  WorkoutTemplate,
} from '../core/plan';
import { shiftPaces } from '../core/presets';
import { DEFAULT_TOLERANCE } from '../core/tolerance';
import { formatDistance, formatDuration, formatPace, toMps } from '../core/units';
import * as db from '../storage/db';
import { useApp } from '../ui/AppContext';
import { Banner, Button, Card, Field, FieldError, IconButton, Screen, Section, Segmented, Stepper, T, Toggle } from '../ui/components';
import { planErrorText } from '../ui/errors';
import { Icon } from '../ui/Icon';
import { DistanceInput, DurationInput, PaceInput, ToleranceEditor } from '../ui/inputs';
import { colors, fonts, radius, space } from '../ui/theme';

const DEFAULT_PACE = toMps(360, 'minkm');

function blank(name: string): WorkoutTemplate {
  const now = Date.now();
  return {
    id: newId('tpl'),
    name,
    unit: 'distance',
    totalDistanceM: 5000,
    items: [{ type: 'stage', stage: makeStage('', 5000, DEFAULT_PACE) }],
    favorite: false,
    createdAt: now,
    updatedAt: now,
  };
}

export default function Builder() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { t, settings } = useApp();
  const [tpl, setTpl] = useState<WorkoutTemplate | null>(() => (id ? null : blank('')));
  const [open, setOpen] = useState<string | null>(null);
  const [triedSave, setTriedSave] = useState(false);

  useEffect(() => {
    if (id) db.getTemplate(id).then((x) => setTpl(x ?? blank('')));
  }, [id]);

  const errors = useMemo(() => (tpl ? validateTemplate(tpl) : []), [tpl]);
  if (!tpl) return <Screen><T>…</T></Screen>;

  const unit = tpl.unit;
  const set = (patch: Partial<WorkoutTemplate>) => setTpl((cur) => (cur ? { ...cur, ...patch } : cur));
  const setItems = (items: PlanItem[]) => set({ items });
  const errFor = (path: string): string | null => {
    const e = errors.find((x) => x.field === path);
    return e ? planErrorText(e, t, settings, unit, { total: tpl.totalDistanceM }) : null;
  };
  const showErr = (path: string) => errFor(path);

  const switchUnit = (u: PlanUnit) => {
    if (u === unit) return;
    // Mængder skifter betydning (meter <-> sekunder): sæt fornuftige standardværdier.
    const fix = (s: StageDef): StageDef => ({ ...s, amount: u === 'distance' ? 1000 : 300 });
    const items = tpl.items.map((it) =>
      it.type === 'stage' ? { ...it, stage: fix(it.stage) } : { ...it, stages: it.stages.map(fix) }
    );
    const total = u === 'distance' ? planTotal(items) : undefined;
    set({ unit: u, items, totalDistanceM: total });
  };

  const addStage = () => {
    const amount = unit === 'distance' ? 1000 : 300;
    const st = makeStage('', amount, DEFAULT_PACE);
    setItems([...tpl.items, { type: 'stage', stage: st }]);
    setOpen(st.id);
  };
  const addRepeat = () => {
    const a = makeStage('', unit === 'distance' ? 400 : 180, toMps(330, 'minkm'));
    const b = makeStage('', unit === 'distance' ? 200 : 120, toMps(420, 'minkm'));
    setItems([...tpl.items, { type: 'repeat', id: newId('rep'), times: 4, stages: [a, b] }]);
  };

  const sum = planTotal(tpl.items);
  const expanded = countExpanded(tpl.items);

  const save = async (start: boolean) => {
    setTriedSave(true);
    if (errors.length) return;
    const final = { ...tpl, quick: false, updatedAt: Date.now() };
    await db.saveTemplate(final);
    if (start) router.replace({ pathname: '/ready', params: { id: final.id } });
    else router.back();
  };

  const stageEditor = (s: StageDef, path: string, label: string, onChange: (s: StageDef) => void, actions: React.ReactNode) => {
    const isOpen = open === s.id;
    const hasErr = errors.some((e) => e.field.startsWith(path));
    const summary = `${unit === 'distance' ? formatDistance(s.amount, settings.distanceUnit, settings.lang) : formatDuration(s.amount * 1000)} · ${formatPace(s.targetMps, settings.paceUnit, settings.lang)}`;
    return (
      <View key={s.id} style={[stageBox, hasErr && { borderColor: colors.danger, borderWidth: 2 }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: isOpen }}
          accessibilityLabel={`${s.name || label}, ${summary}`}
          onPress={() => setOpen(isOpen ? null : s.id)}
          style={{ flexDirection: 'row', alignItems: 'center', minHeight: 48, gap: space.s }}
        >
          <View style={{ flex: 1 }}>
            <T style={{ fontFamily: fonts.semibold }}>{s.name || label}</T>
            <T variant="small">{summary}</T>
          </View>
          {hasErr ? <Icon name="warning" color={colors.danger} /> : null}
          <Icon name={isOpen ? 'chevronUp' : 'chevronDown'} color={colors.textMuted} />
        </Pressable>
        {isOpen ? (
          <View style={{ gap: space.m }}>
            <Field label={t('name')} value={s.name} placeholder={label} onChangeText={(name) => onChange({ ...s, name })} maxLength={40} />
            {unit === 'distance' ? (
              <DistanceInput label={t('distance')} meters={s.amount} unit={settings.distanceUnit} onChange={(amount) => onChange({ ...s, amount })} error={showErr(`${path}.amount`)} />
            ) : (
              <DurationInput label={t('duration')} seconds={s.amount} onChange={(amount) => onChange({ ...s, amount })} error={showErr(`${path}.amount`)} />
            )}
            <PaceInput label={t('targetPace')} valueMps={s.targetMps} onChange={(targetMps) => onChange({ ...s, targetMps })} showUnitSwitch={false} error={showErr(`${path}.targetMps`)} />
            <Toggle
              label={t('stageTolerance')}
              value={!!s.tolerance}
              onChange={(on) => onChange({ ...s, tolerance: on ? settings.coaching.tolerance ?? DEFAULT_TOLERANCE : null })}
            />
            {s.tolerance ? <ToleranceEditor value={s.tolerance} targetMps={s.targetMps} onChange={(tol) => onChange({ ...s, tolerance: tol })} /> : null}
            {showErr(`${path}.tolerance`) ? <FieldError text={showErr(`${path}.tolerance`)!} /> : null}
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>{actions}</View>
      </View>
    );
  };

  // Løbende nummerering af etaper til standardnavne
  const stageNumbers = new Map<string, number>();
  tpl.items.forEach((it) => {
    if (it.type === 'stage') stageNumbers.set(it.stage.id, stageNumbers.size + 1);
    else it.stages.forEach((x) => stageNumbers.set(x.id, stageNumbers.size + 1));
  });
  const topErrors = errors.filter((e) => ['total', 'items', 'name'].includes(e.field));

  return (
    <Screen>
      <Stack.Screen options={{ title: id ? t('edit') : t('buildWorkout') }} />
      <Field label={t('workoutName')} value={tpl.name} onChangeText={(name) => set({ name })} error={triedSave ? errFor('name') : null} maxLength={60} />
      <Segmented
        label={t('buildWorkout')}
        value={unit}
        onChange={switchUnit}
        options={[
          { value: 'distance', label: t('byDistance') },
          { value: 'time', label: t('byTime') },
        ]}
      />
      {unit === 'distance' ? (
        <DistanceInput label={t('totalDistance')} meters={tpl.totalDistanceM ?? 0} unit={settings.distanceUnit} onChange={(m) => set({ totalDistanceM: m })} error={errFor('total')} />
      ) : null}

      <Section title={t('stages')}>
        {tpl.items.map((it, i) => {
          const move = (d: -1 | 1) => setItems(moveItem(tpl.items, i, i + d));
          const removeItem = () => setItems(tpl.items.filter((_, j) => j !== i));
          const copyItem = () => {
            const c: PlanItem =
              it.type === 'stage'
                ? { type: 'stage', stage: { ...it.stage, id: newId('st') } }
                : { ...it, id: newId('rep'), stages: it.stages.map((s) => ({ ...s, id: newId('st') })) };
            const items = tpl.items.slice();
            items.splice(i + 1, 0, c);
            setItems(items);
          };
          const itemActions = (
            <>
              <IconButton icon="chevronUp" label={t('moveUp')} onPress={() => move(-1)} disabled={i === 0} />
              <IconButton icon="chevronDown" label={t('moveDown')} onPress={() => move(1)} disabled={i === tpl.items.length - 1} />
              <IconButton icon="copy" label={t('copy')} onPress={copyItem} />
              <IconButton icon="trash" label={t('remove')} color={colors.danger} onPress={removeItem} />
            </>
          );
          if (it.type === 'stage') {
            return stageEditor(it.stage, `items.${i}.stage`, t('stageDefaultName', { n: stageNumbers.get(it.stage.id) ?? 0 }), (s) => {
              const items = tpl.items.slice();
              items[i] = { type: 'stage', stage: s };
              setItems(items);
            }, itemActions);
          }
          const rep = it;
          return (
            <View key={rep.id} style={repeatBox}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s }}>
                <Icon name="repeat" color={colors.blue} />
                <T style={{ fontFamily: fonts.bold, flex: 1 }}>{t('repeatBlock')}</T>
              </View>
              <Stepper label={t('times')} value={rep.times} min={1} max={100} onChange={(times) => {
                const items = tpl.items.slice();
                items[i] = { ...rep, times };
                setItems(items);
              }} format={(n) => t('timesShort', { n })} />
              {showErr(`items.${i}.times`) ? <FieldError text={showErr(`items.${i}.times`)!} /> : null}
              {rep.stages.map((s, j) => {
                const upd = (stages: StageDef[]) => {
                  const items = tpl.items.slice();
                  items[i] = { ...rep, stages };
                  setItems(items);
                };
                return stageEditor(s, `items.${i}.stages.${j}`, t('stageDefaultName', { n: stageNumbers.get(s.id) ?? 0 }), (ns) => {
                  const stages = rep.stages.slice();
                  stages[j] = ns;
                  upd(stages);
                }, (
                  <>
                    <IconButton icon="chevronUp" label={t('moveUp')} onPress={() => upd(moveItem(rep.stages, j, j - 1))} disabled={j === 0} />
                    <IconButton icon="chevronDown" label={t('moveDown')} onPress={() => upd(moveItem(rep.stages, j, j + 1))} disabled={j === rep.stages.length - 1} />
                    <IconButton icon="copy" label={t('copy')} onPress={() => {
                      const stages = rep.stages.slice();
                      stages.splice(j + 1, 0, { ...s, id: newId('st') });
                      upd(stages);
                    }} />
                    <IconButton icon="trash" label={t('remove')} color={colors.danger} onPress={() => upd(rep.stages.filter((_, k) => k !== j))} />
                  </>
                ));
              })}
              {showErr(`items.${i}.stages`) ? <FieldError text={showErr(`items.${i}.stages`)!} /> : null}
              <Button variant="secondary" icon="plus" label={t('addStage')} onPress={() => {
                const st = makeStage('', unit === 'distance' ? 400 : 120, DEFAULT_PACE);
                const items = tpl.items.slice();
                items[i] = { ...rep, stages: [...rep.stages, st] };
                setItems(items);
                setOpen(st.id);
              }} />
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>{itemActions}</View>
            </View>
          );
        })}
        <Button variant="secondary" icon="plus" label={t('addStage')} onPress={addStage} />
        <Button variant="secondary" icon="repeat" label={t('addRepeat')} onPress={addRepeat} />
      </Section>

      <Card>
        <T variant="h2">{t('overview')}</T>
        {unit === 'distance' ? (
          <>
            <T>{`${t('stages')}: ${formatDistance(sum, settings.distanceUnit, settings.lang)} / ${t('totalDistance')}: ${formatDistance(tpl.totalDistanceM ?? 0, settings.distanceUnit, settings.lang)}`}</T>
            <T>{`${t('expectedFinish')}: ${formatDuration(estimateDuration(tpl.items) * 1000)}`}</T>
          </>
        ) : (
          <>
            <T>{`${t('totalDuration')}: ${formatDuration(sum * 1000)}`}</T>
            <T>{`${t('expectedDistance')}: ${formatDistance(estimateDistance(tpl.items), settings.distanceUnit, settings.lang)}`}</T>
            <T variant="small">{t('estimateNote')}</T>
          </>
        )}
        <T variant="small">{t('stagesCount', { n: expanded })}</T>
        <T variant="label">{t('allPaces')}</T>
        <View style={{ flexDirection: 'row', gap: space.s }}>
          <Button style={{ flex: 1 }} variant="secondary" label={t('shiftFaster')} onPress={() => setItems(shiftPaces(tpl.items, -5))} />
          <Button style={{ flex: 1 }} variant="secondary" label={t('shiftSlower')} onPress={() => setItems(shiftPaces(tpl.items, 5))} />
        </View>
        {topErrors.filter((e) => e.field !== 'name' || triedSave).map((e, k) => (
          <FieldError key={k} text={planErrorText(e, t, settings, unit, { total: tpl.totalDistanceM })} />
        ))}
      </Card>
      {triedSave && errors.length ? <Banner tone="danger" text={t('fixBeforeStart')} /> : null}
      <Button label={t('save')} onPress={() => save(false)} />
      <Button variant="accent" icon="play" label={`${t('save')} · ${t('readyToStart')}`} onPress={() => save(true)} />
    </Screen>
  );
}

const stageBox = {
  borderWidth: 1,
  borderColor: colors.border,
  borderRadius: radius.m,
  padding: space.m,
  gap: space.s,
  backgroundColor: colors.white,
} as const;

const repeatBox = {
  borderWidth: 2,
  borderColor: colors.blue,
  borderRadius: radius.l,
  padding: space.m,
  gap: space.s,
  backgroundColor: colors.blueLight,
} as const;

