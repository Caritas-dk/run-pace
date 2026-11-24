// K38/K40: aktiv tur. Aktuelt tempo er det største tal; status vises med ikon og tekst.
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, BackHandler, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatDistance, formatDuration, formatPace, formatPaceValue, isPaceStyle, paceUnitLabel } from '../core/units';
import { runner, RunnerState } from '../services/runner';
import { useApp } from '../ui/AppContext';
import { Banner, Button, IconButton, Stat, T } from '../ui/components';
import { Icon, IconName } from '../ui/Icon';
import { colors, fonts, radius, space } from '../ui/theme';

export default function Run() {
  const { t, settings } = useApp();
  const [st, setSt] = useState<RunnerState>(runner.state);
  useEffect(() => runner.subscribe(setSt), []);

  useEffect(() => {
    if (st.finishedResultId) {
      const id = st.finishedResultId;
      runner.clearFinished();
      router.replace({ pathname: '/result/[id]', params: { id } });
    }
  }, [st.finishedResultId]);

  // Tilbage-knap på Android må ikke afslutte turen ved et uheld.
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        router.replace('/');
        return true;
      });
      return () => sub.remove();
    }, [])
  );

  const s = st.snapshot;
  if (!s) {
    return (
      <SafeAreaView style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.l }}>
        <T>{t('noResults')}</T>
        <Button label={t('back')} onPress={() => router.replace('/')} />
      </SafeAreaView>
    );
  }
  const lang = settings.lang;
  const pu = settings.paceUnit;
  const paused = s.status === 'paused';

  // Instruktion og visning
  let instr: { text: string; icon: IconName | null; bg: string; fg: string };
  if (paused) instr = { text: t('paused'), icon: 'pause', bg: colors.surface, fg: colors.text };
  else if (s.gps === 'disabled') instr = { text: t('noGpsCoaching'), icon: 'warning', bg: colors.warningBg, fg: colors.warningText };
  else if (s.suppression === 'no_gps') instr = { text: t('gpsUncertain'), icon: 'gps', bg: colors.warningBg, fg: colors.warningText };
  else if (s.suppression === 'measuring') instr = { text: t('measuring'), icon: null, bg: colors.surface, fg: colors.text };
  else if (s.instruction === 'slow_down') instr = { text: t('slowDown'), icon: 'down', bg: colors.fast, fg: colors.white };
  else if (s.instruction === 'speed_up') instr = { text: t('speedUp'), icon: 'up', bg: colors.blue, fg: colors.white };
  else if (s.instruction === 'stable') instr = { text: t('stable'), icon: 'check', bg: colors.lime, fg: colors.black };
  else if (s.suppression === 'settling') instr = { text: t('settling'), icon: null, bg: colors.surface, fg: colors.text };
  else instr = { text: t('measuring'), icon: null, bg: colors.surface, fg: colors.text };

  const isDistance = runner.engine?.plan.unit === 'distance';
  const remainingText = isDistance
    ? formatDistance(s.stageRemaining, settings.distanceUnit, lang)
    : formatDuration(s.stageRemaining);
  const next = runner.engine?.plan.stages[s.stageIndex + 1];
  const lo = isPaceStyle(pu) ? s.bounds.maxMps : s.bounds.minMps;
  const hi = isPaceStyle(pu) ? s.bounds.minMps : s.bounds.maxMps;

  const confirmStop = () =>
    Alert.alert(t('stopTitle'), undefined, [
      { text: t('stopContinue'), style: 'cancel' },
      {
        text: t('stopDiscard'),
        style: 'destructive',
        onPress: () =>
          Alert.alert(t('discardConfirm'), undefined, [
            { text: t('cancel'), style: 'cancel' },
            {
              text: t('stopDiscard'),
              style: 'destructive',
              onPress: async () => {
                await runner.stop(false);
                router.replace('/');
              },
            },
          ]),
      },
      { text: t('stopSave'), onPress: () => runner.stop(true) },
    ]);

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <View style={styles.top}>
        <View style={{ flex: 1 }}>
          <T style={styles.topText}>{t('stageXofY', { x: s.stageIndex + 1, y: s.stageCount })}</T>
          <T style={styles.topSub} numberOfLines={1}>
            {`${s.stage.name || t('stageDefaultName', { n: s.stageIndex + 1 })} · ${remainingText} ${t('remaining')}`}
          </T>
        </View>
        <IconButton
          icon={st.soundOn ? 'sound' : 'soundOff'}
          label={st.soundOn ? t('soundOff') : t('soundOn')}
          color={colors.white}
          onPress={() => runner.setSoundOn(!st.soundOn)}
        />
      </View>

      <View style={styles.body}>
        <View style={[styles.instr, { backgroundColor: instr.bg }]} accessible accessibilityRole="text" accessibilityLiveRegion="polite" accessibilityLabel={instr.text}>
          {instr.icon ? <Icon name={instr.icon} size={34} color={instr.fg} /> : null}
          <T style={[styles.instrText, { color: instr.fg }]}>{instr.text}</T>
        </View>

        <View style={{ alignItems: 'center' }} accessible accessibilityLabel={`${t('currentPace')}: ${s.speed ? formatPace(s.speed, pu, lang) : t('measuring')}`}>
          <T variant="small">{t('currentPace')}</T>
          <T variant="display" style={{ fontSize: 96, lineHeight: 104 }}>{formatPaceValue(s.speed, pu, lang)}</T>
          <T variant="small">{paceUnitLabel(pu, lang)}</T>
        </View>

        <View style={styles.target} accessible accessibilityLabel={`${t('targetPace')}: ${formatPace(s.stage.targetMps, pu, lang)}`}>
          <T style={{ fontFamily: fonts.semibold }}>{`${t('targetPace')}: ${formatPace(s.stage.targetMps, pu, lang)}`}</T>
          <T variant="small">{`${formatPaceValue(lo, pu, lang)} – ${formatPaceValue(hi, pu, lang)}`}</T>
        </View>

        <View style={styles.stats}>
          <Stat label={t('distance')} value={formatDistance(s.distance, settings.distanceUnit, lang)} />
          <Stat label={t('totalTime')} value={formatDuration(s.totalMs)} />
        </View>
        <View style={styles.stats}>
          <Stat label={t('activeTime')} value={formatDuration(s.activeMs)} />
          {s.pauseMs > 0 ? <Stat label={t('pauseTime')} value={formatDuration(s.pauseMs)} /> : <View style={{ flex: 1 }} />}
        </View>

        {next ? (
          <T variant="small" style={{ textAlign: 'center' }}>
            {t('nextStage', { name: next.name || t('stageDefaultName', { n: next.index + 1 }), pace: formatPace(next.targetMps, pu, lang) })}
          </T>
        ) : null}

        {st.headphonesLost ? <Banner tone="danger" text={t('headphonesLost')} action={{ label: t('useSpeaker'), onPress: () => runner.useSpeaker() }} /> : null}
        {s.distanceUncertain && s.gps === 'ok' ? <T variant="small" style={{ textAlign: 'center' }}>{t('uncertainData')}</T> : null}
      </View>

      <View style={styles.controls}>
        {paused ? (
          <Button big style={{ flex: 2 }} variant="accent" icon="play" label={t('resume')} onPress={() => runner.resume()} />
        ) : (
          <Button big style={{ flex: 2 }} icon="pause" label={t('pause')} onPress={() => runner.pause()} />
        )}
        <Button
          big
          style={{ flex: 1 }}
          variant="danger"
          icon="stop"
          label={t('stop')}
          accessibilityHint={t('holdToStop')}
          onPress={() => Alert.alert(t('holdToStop'))}
          onLongPress={confirmStop}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  top: { backgroundColor: colors.blue, paddingHorizontal: space.l, paddingVertical: space.s, flexDirection: 'row', alignItems: 'center' },
  topText: { color: colors.white, fontFamily: fonts.bold, fontSize: 18 },
  topSub: { color: colors.white, fontSize: 15 },
  body: { flex: 1, paddingHorizontal: space.l, paddingTop: space.m, gap: space.m, justifyContent: 'space-evenly' },
  instr: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.s, borderRadius: radius.l, minHeight: 64, paddingHorizontal: space.l },
  instrText: { fontFamily: fonts.bold, fontSize: 26 },
  target: { alignItems: 'center', gap: 2 },
  stats: { flexDirection: 'row', gap: space.l },
  controls: { flexDirection: 'row', gap: space.m, padding: space.l },
});
