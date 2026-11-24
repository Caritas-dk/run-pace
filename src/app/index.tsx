// Forside: Hurtig start, Byg træning, favoritter og seneste resultat.
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WorkoutTemplate } from '../core/plan';
import { formatDistance, formatDuration, formatPace } from '../core/units';
import { runner } from '../services/runner';
import * as db from '../storage/db';
import { useApp } from '../ui/AppContext';
import { Banner, Button, Card, EmptyState, IconButton, ListRow, Mascot, Screen, Section, T } from '../ui/components';
import { describeTemplate } from '../ui/format';
import { colors, fonts, space } from '../ui/theme';

export default function Home() {
  const { t, settings, update } = useApp();
  const [favs, setFavs] = useState<WorkoutTemplate[]>([]);
  const [latest, setLatest] = useState<db.ResultRow | null>(null);
  const [active, setActive] = useState(runner.active);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      (async () => {
        const [tpls, results] = await Promise.all([db.listTemplates(), db.listResults(1)]);
        if (!alive) return;
        setFavs(tpls.filter((x) => x.favorite));
        setLatest(results[0] ?? null);
        setActive(runner.active);
      })();
      return () => {
        alive = false;
      };
    }, [])
  );

  const r = latest?.result;
  return (
    <View style={{ flex: 1, backgroundColor: colors.white }}>
      <SafeAreaView edges={['top']} style={styles.header}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }} accessibilityRole="header" accessible accessibilityLabel="Run Pace">
            <T style={styles.brandRun}>RUN</T>
            <T style={styles.brandPace}>PACE</T>
          </View>
          <Mascot size={92} />
        </View>
        <View style={styles.headerIcons}>
          <IconButton icon="history" label={t('history')} color={colors.white} onPress={() => router.push('/history')} />
          <IconButton icon="settings" label={t('settings')} color={colors.white} onPress={() => router.push('/settings')} />
        </View>
      </SafeAreaView>
      <Screen edges={['bottom']}>
        {active ? (
          <Banner tone="info" text={t('runInProgress')} action={{ label: t('openRun'), onPress: () => router.push('/run') }} />
        ) : null}
        <Button big variant="accent" icon="play" label={t('quickStart')} onPress={() => router.push('/quick')} accessibilityHint={t('quickStartSub')} />
        <Button big icon="plus" label={t('buildWorkout')} onPress={() => router.push('/builder')} accessibilityHint={t('buildWorkoutSub')} />

        <Section
          title={t('favorites')}
          right={<Button variant="ghost" label={t('workouts')} onPress={() => router.push('/library')} />}
        >
          {favs.length === 0 ? (
            <T variant="small">{t('noFavorites')}</T>
          ) : (
            favs.map((f) => (
              <ListRow
                key={f.id}
                title={f.name}
                subtitle={describeTemplate(f, settings)}
                onPress={() => router.push({ pathname: '/ready', params: { id: f.id } })}
              />
            ))
          )}
        </Section>

        <Section title={t('latestResult')}>
          {r ? (
            <Card>
              <ListRow
                title={r.templateName}
                subtitle={new Date(r.startedAt).toLocaleString(settings.lang === 'da' ? 'da-DK' : 'en-GB')}
                onPress={() => router.push({ pathname: '/result/[id]', params: { id: r.id } })}
              />
              <View style={{ flexDirection: 'row', gap: space.l, flexWrap: 'wrap' }}>
                <T>{formatDistance(r.distanceM, settings.distanceUnit, settings.lang)}</T>
                <T>{formatDuration(r.activeMs)}</T>
                <T>{r.avgMps ? formatPace(r.avgMps, settings.paceUnit, settings.lang) : '–'}</T>
                {r.share ? <T style={{ fontFamily: fonts.bold }}>{`${Math.round(r.share.inPct)} % ${t('inZone').toLowerCase()}`}</T> : null}
              </View>
            </Card>
          ) : (
            <EmptyState text={t('noResults')} />
          )}
        </Section>
      </Screen>

      <Modal visible={!settings.introSeen} animationType="fade" onRequestClose={() => update({ introSeen: true })}>
        <SafeAreaView style={styles.intro}>
          <T style={styles.brandRun}>RUN</T>
          <T style={styles.brandPace}>PACE</T>
          <Mascot size={200} />
          <T variant="h2" style={{ color: colors.white }}>{t('introTitle')}</T>
          {(['intro1', 'intro2', 'intro3'] as const).map((k) => (
            <T key={k} style={{ color: colors.white, textAlign: 'center' }}>{t(k)}</T>
          ))}
          <Button big variant="accent" label={t('introStart')} onPress={() => update({ introSeen: true })} style={{ alignSelf: 'stretch' }} />
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { backgroundColor: colors.blue, paddingHorizontal: space.l, paddingBottom: space.s },
  headerRow: { flexDirection: 'row', alignItems: 'center', paddingTop: space.s },
  headerIcons: { flexDirection: 'row', justifyContent: 'flex-end' },
  brandRun: { fontFamily: fonts.display, fontSize: 44, lineHeight: 44, color: colors.white },
  brandPace: { fontFamily: fonts.display, fontSize: 44, lineHeight: 46, color: colors.lime },
  intro: { flex: 1, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center', gap: space.l, padding: space.xl },
});
