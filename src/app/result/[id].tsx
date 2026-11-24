// K43-K46: resultat, tid i målzonen, datadækning, læring over tid og brugte indstillinger.
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, useWindowDimensions, View } from 'react-native';
import { LogEvent, PaceSample } from '../../core/session';
import { learning, LearningRow, SessionResult, zoneShare } from '../../core/stats';
import { formatDistance, formatDuration, formatPace, isPaceStyle } from '../../core/units';
import { StringKey } from '../../i18n/strings';
import * as db from '../../storage/db';
import { useApp } from '../../ui/AppContext';
import { Banner, Button, Card, Mascot, Screen, Section, Stat, T } from '../../ui/components';
import { PaceChart, RouteView } from '../../ui/charts';
import { Icon } from '../../ui/Icon';
import { colors, fonts, radius, space } from '../../ui/theme';

function ZoneBar({ inPct, fastPct, slowPct, label }: { inPct: number; fastPct: number; slowPct: number; label: string }) {
  return (
    <View accessible accessibilityLabel={label} style={{ flexDirection: 'row', height: 20, borderRadius: radius.s, overflow: 'hidden', backgroundColor: colors.surface }}>
      <View style={{ width: `${slowPct}%`, backgroundColor: colors.blue }} />
      <View style={{ width: `${inPct}%`, backgroundColor: colors.lime }} />
      <View style={{ width: `${fastPct}%`, backgroundColor: colors.fast }} />
    </View>
  );
}

export default function Result() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, settings } = useApp();
  const { width } = useWindowDimensions();
  const [r, setR] = useState<SessionResult | null>(null);
  const [samples, setSamples] = useState<PaceSample[]>([]);
  const [route, setRoute] = useState<{ lat: number; lon: number; seg: number }[]>([]);
  const [events, setEvents] = useState<LogEvent[]>([]);
  const [rows, setRows] = useState<LearningRow[]>([]);
  const [showEvents, setShowEvents] = useState(false);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const res = await db.getResult(id);
      if (!res) return setMissing(true);
      setR(res);
      const [s, rt, ev, all] = await Promise.all([db.getSamples(id), db.getRoute(id), db.getEvents(id), db.listResults()]);
      setSamples(s);
      setRoute(rt);
      setEvents(ev);
      setRows(learning(all.map((x) => x.result), res.planHash));
    })();
  }, [id]);

  if (missing) return <Screen><T>{t('noResults')}</T></Screen>;
  if (!r) return <Screen><T>…</T></Screen>;

  const lang = settings.lang;
  const pu = settings.paceUnit;
  const du = settings.distanceUnit;
  const cw = width - 2 * space.l - 2 * space.l - 2;

  const remove = () =>
    Alert.alert(t('deleteResult'), t('deleteResultNote'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('delete'),
        style: 'destructive',
        onPress: async () => {
          await db.deleteSession(r.id);
          router.replace('/history');
        },
      },
    ]);

  const pct = (x: number) => `${Math.round(x)} %`;
  const tol = r.coaching.tolerance;
  const tolText =
    tol.kind === 'seconds'
      ? `−${tol.faster}/+${tol.slower} s/${tol.per === 'km' ? 'km' : 'mile'}`
      : tol.kind === 'percent'
        ? `+${tol.faster}/−${tol.slower} %`
        : `+${(tol.fasterMps * 3.6).toFixed(1)}/−${(tol.slowerMps * 3.6).toFixed(1)} km/t`;

  return (
    <Screen>
      <Stack.Screen options={{ title: t('result') }} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m }}>
        <View style={{ flex: 1 }}>
          <T variant="h2">{r.templateName}</T>
          <T variant="small">{new Date(r.startedAt).toLocaleString(lang === 'da' ? 'da-DK' : 'en-GB')}</T>
          <T style={{ fontFamily: fonts.bold }}>{r.endReason === 'completed' ? t('completed') : t('aborted')}</T>
        </View>
        {r.endReason === 'completed' ? <Mascot size={84} /> : null}
      </View>

      {r.distanceUncertain ? <Banner text={t('uncertainData')} /> : null}

      <Card>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.l }}>
          <Stat big label={t('distance')} value={`${formatDistance(r.distanceM, du, lang)}${r.distanceUncertain ? ' *' : ''}`} />
          <Stat big label={t('avgPace')} value={r.avgMps ? `${formatPace(r.avgMps, pu, lang)}${r.distanceUncertain ? ' *' : ''}` : '–'} />
          <Stat label={t('totalTime')} value={formatDuration(r.totalMs)} />
          <Stat label={t('activeTime')} value={formatDuration(r.activeMs)} />
          <Stat label={t('pauseTime')} value={formatDuration(r.pauseMs)} />
          <Stat label={t('corrections')} value={`${r.cues.fast + r.cues.slow}`} />
        </View>
      </Card>

      <Section title={t('timeInZone')}>
        {r.share ? (
          <Card>
            <ZoneBar {...r.share} label={`${t('inZone')} ${pct(r.share.inPct)}, ${t('tooFast')} ${pct(r.share.fastPct)}, ${t('tooSlow')} ${pct(r.share.slowPct)}`} />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.l }}>
              <Stat label={t('inZone')} value={`${pct(r.share.inPct)} · ${formatDuration(r.zone.in)}`} />
              <Stat label={t('tooFast')} value={`${pct(r.share.fastPct)} · ${formatDuration(r.zone.fast)}`} />
              <Stat label={t('tooSlow')} value={`${pct(r.share.slowPct)} · ${formatDuration(r.zone.slow)}`} />
            </View>
            <T>{`${t('coverage')}: ${r.coverage != null ? pct(r.coverage * 100) : '–'}`}</T>
            <T variant="small">{t('coverageNote')}</T>
          </Card>
        ) : (
          <T>{t('noScore')}</T>
        )}
      </Section>

      {samples.length > 1 ? (
        <Section title={t('paceOverTime')}>
          <Card>
            <PaceChart samples={samples} unit={pu} lang={lang} width={cw} label={t('paceOverTime')} />
            <T variant="small">— — {t('targetPace')}</T>
          </Card>
        </Section>
      ) : null}

      <Section title={t('stages')}>
        {r.stages.map((s) => {
          const sh = zoneShare(s.zone);
          return (
            <Card key={s.index} style={{ gap: space.xs }}>
              <View style={{ flexDirection: 'row' }}>
                <T style={{ flex: 1, fontFamily: fonts.semibold }}>{`${s.index + 1}. ${s.name || t('stageDefaultName', { n: s.index + 1 })}`}</T>
                {s.uncertain ? <Icon name="warning" size={18} color={colors.warningText} /> : null}
              </View>
              <T variant="small">
                {`${t('targetPace')} ${formatPace(s.targetMps, pu, lang)} · ${formatDistance(s.distanceM, du, lang)} · ${formatDuration(s.activeMs)} · ${s.avgMps ? formatPace(s.avgMps, pu, lang) : '–'}`}
              </T>
              {sh ? <ZoneBar {...sh} label={`${t('inZone')} ${pct(sh.inPct)}`} /> : null}
              <T variant="small">{`${sh ? `${t('inZone')} ${pct(sh.inPct)} · ` : ''}${t('corrections')} ${s.cues.fast + s.cues.slow}${s.completed ? '' : ` · ${t('aborted')}`}`}</T>
            </Card>
          );
        })}
      </Section>

      {r.splits.length ? (
        <Section title={t('splits')}>
          <Card style={{ gap: space.xs }}>
            {r.splits.map((sp) => (
              <View key={sp.index} style={{ flexDirection: 'row' }}>
                <T style={{ width: 64 }}>{`${sp.index} ${du === 'km' ? 'km' : 'mi'}`}</T>
                <T style={{ flex: 1, fontFamily: fonts.semibold }}>{formatDuration(sp.durationMs)}</T>
                <T>{formatPace((du === 'km' ? 1000 : 1609.344) / (sp.durationMs / 1000), pu, lang)}</T>
                <T style={{ width: 20 }}>{sp.uncertain ? '*' : ''}</T>
              </View>
            ))}
          </Card>
        </Section>
      ) : null}

      <Section title={t('route')}>
        {route.length > 1 ? <RouteView points={route} width={cw + 2 * space.l} label={t('route')} /> : <T variant="small">{t('noRoute')}</T>}
      </Section>

      <Section title={t('events')}>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: showEvents }} onPress={() => setShowEvents(!showEvents)} style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: space.s }}>
          <T style={{ flex: 1 }}>{`${events.length}`}</T>
          <Icon name={showEvents ? 'chevronUp' : 'chevronDown'} color={colors.textMuted} />
        </Pressable>
        {showEvents
          ? events.map((e, i) => (
              <View key={i} style={{ flexDirection: 'row', gap: space.s }}>
                <T style={{ width: 72, color: colors.textMuted }}>{formatDuration(e.activeMs)}</T>
                <T style={{ flex: 1 }}>{t(`ev_${e.kind}` as StringKey)}</T>
                <T variant="small">{`${t('stage')} ${e.stage + 1}`}</T>
              </View>
            ))
          : null}
      </Section>

      {rows.length > 1 ? (
        <Section title={t('learning')}>
          <Card style={{ gap: space.xs }}>
            {rows.map((x) => (
              <View key={x.sessionId} style={{ flexDirection: 'row', gap: space.s }}>
                <T style={{ flex: 1 }}>{new Date(x.startedAt).toLocaleDateString(lang === 'da' ? 'da-DK' : 'en-GB')}</T>
                <T style={{ width: 60, fontFamily: fonts.semibold }}>{x.inPct != null ? pct(x.inPct) : '–'}</T>
                <T style={{ width: 60 }}>{x.coverage != null ? pct(x.coverage * 100) : '–'}</T>
                <T style={{ width: 36 }}>{x.cues}</T>
                <T style={{ width: 16 }}>{x.settingsChanged ? '†' : ''}</T>
              </View>
            ))}
            <T variant="small">{`${t('inZone')} · ${t('coverage')} · ${t('corrections')} · † ${t('settingsChangedMark')}`}</T>
            <T variant="small">{t('learningNote')}</T>
          </Card>
        </Section>
      ) : null}

      <Section title={t('usedSettings')}>
        <T variant="small">
          {`${t('tolerance')}: ${tolText} · ${t('window')}: ${r.coaching.windowSec} s · ${t('deviation')}: ${r.coaching.deviationSec} s · ${t('cooldown')}: ${r.coaching.cooldownSec} s · ${t('settle')}: ${r.coaching.settleSec} s`}
        </T>
        <T variant="small">{`${t('tolerance')} (${t('stage')} 1): ${formatPace(isPaceStyle(pu) ? r.stages[0]?.bounds.maxMps : r.stages[0]?.bounds.minMps, pu, lang)} – ${formatPace(isPaceStyle(pu) ? r.stages[0]?.bounds.minMps : r.stages[0]?.bounds.maxMps, pu, lang)}`}</T>
      </Section>

      <Button variant="danger" icon="trash" label={t('deleteResult')} onPress={remove} />
      <Button variant="secondary" label={t('back')} onPress={() => router.replace('/')} />
    </Screen>
  );
}
