// K11, K27, K29: oversigt, GPS-status, lydtest og start.
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Modal, View } from 'react-native';
import { RawPoint } from '../core/gps';
import { estimateDistance, estimateDuration, freezePlan, validateTemplate, WorkoutTemplate } from '../core/plan';
import { computeBounds } from '../core/tolerance';
import { formatDistance, formatDuration, formatPace, isPaceStyle } from '../core/units';
import { SOUND_NAMES } from '../i18n/strings';
import { testSound } from '../services/audio';
import { getPermissionState, openAppSettings, PermissionState, requestPermissions, watchPreview } from '../services/location';
import { runner } from '../services/runner';
import * as db from '../storage/db';
import { useApp } from '../ui/AppContext';
import { Banner, Button, Card, Screen, Section, T } from '../ui/components';
import { Icon } from '../ui/Icon';
import { colors, fonts, space } from '../ui/theme';

export default function Ready() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, settings } = useApp();
  const [tpl, setTpl] = useState<WorkoutTemplate | null>(null);
  const [perm, setPerm] = useState<PermissionState | null>(null);
  const [fix, setFix] = useState<RawPoint | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [testing, setTesting] = useState(false);
  const [count, setCount] = useState<number | null>(null);
  const [starting, setStarting] = useState(false);
  const stopPreview = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (id) db.getTemplate(id).then(setTpl);
  }, [id]);

  const refreshPerm = useCallback(async () => {
    const p = await getPermissionState();
    setPerm(p);
    return p;
  }, []);

  // GPS-forhåndsvisning, mens skærmen er åben.
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      (async () => {
        const p = await refreshPerm();
        if (p.foreground && p.servicesEnabled && alive) {
          stopPreview.current = await watchPreview((pt) => alive && setFix(pt)).catch(() => null);
        }
      })();
      const timer = setInterval(() => setNow(Date.now()), 1000);
      const sub = AppState.addEventListener('change', (s) => s === 'active' && refreshPerm());
      return () => {
        alive = false;
        clearInterval(timer);
        sub.remove();
        stopPreview.current?.();
        stopPreview.current = null;
      };
    }, [refreshPerm])
  );

  if (!tpl) return <Screen><T>…</T></Screen>;
  const plan = freezePlan(tpl);
  const errors = validateTemplate(tpl);
  const lang = settings.lang;
  const pu = settings.paceUnit;

  const fresh = fix && now - fix.t < 5000;
  const gpsUsable = !!(fresh && fix!.acc != null && fix!.acc <= 25 && perm?.foreground);
  const needGps = tpl.unit === 'distance';

  const askPermission = async () => {
    const p = await requestPermissions();
    setPerm(p);
    if (p.foreground) {
      stopPreview.current?.();
      stopPreview.current = await watchPreview(setFix).catch(() => null);
    }
  };

  const begin = async (gps: boolean) => {
    if (starting) return;
    setStarting(true);
    stopPreview.current?.();
    stopPreview.current = null;
    const go = async () => {
      try {
        await runner.start(tpl, settings, gps);
        router.replace('/run');
      } finally {
        setStarting(false);
        setCount(null);
      }
    };
    if (settings.countdownSec > 0) {
      let n = settings.countdownSec;
      setCount(n);
      const iv = setInterval(() => {
        n -= 1;
        if (n <= 0) {
          clearInterval(iv);
          go();
        } else setCount(n);
      }, 1000);
    } else go();
  };

  const b = computeBounds(settings.coaching.tolerance, plan.stages[0]?.targetMps ?? 3);
  const lo = isPaceStyle(pu) ? b.maxMps : b.minMps;
  const hi = isPaceStyle(pu) ? b.minMps : b.maxMps;

  let gpsText: string;
  let gpsTone: 'ok' | 'warn' = 'warn';
  if (!perm) gpsText = t('gpsSearching');
  else if (!perm.servicesEnabled) gpsText = t('gpsOff');
  else if (!perm.foreground) gpsText = t('gpsDenied');
  else if (!fresh) gpsText = t('gpsSearching');
  else if (gpsUsable) {
    gpsText = t('gpsGood', { acc: Math.round(fix!.acc!) });
    gpsTone = 'ok';
  } else gpsText = t('gpsWeak', { acc: Math.round(fix!.acc ?? 99) });

  return (
    <Screen>
      <Stack.Screen options={{ title: t('readyToStart') }} />
      <T variant="h2">{tpl.name}</T>

      <Card>
        <T variant="label">{t('overview')}</T>
        {plan.stages.slice(0, 30).map((s) => (
          <View key={s.index} style={{ flexDirection: 'row', gap: space.s }}>
            <T style={{ width: 28, color: colors.textMuted }}>{s.index + 1}</T>
            <T style={{ flex: 1 }} numberOfLines={1}>
              {s.name || t('stageDefaultName', { n: s.index + 1 })}
              {s.repeat ? ` (${s.repeat.round}/${s.repeat.of})` : ''}
            </T>
            <T>{tpl.unit === 'distance' ? formatDistance(s.amount, settings.distanceUnit, lang) : formatDuration(s.amount * 1000)}</T>
            <T style={{ fontFamily: fonts.bold, minWidth: 96, textAlign: 'right' }}>{formatPace(s.targetMps, pu, lang)}</T>
          </View>
        ))}
        {plan.stages.length > 30 ? <T variant="small">… {t('stagesCount', { n: plan.stages.length })}</T> : null}
        <T style={{ fontFamily: fonts.semibold }}>
          {tpl.unit === 'distance'
            ? `${t('totalDistance')}: ${formatDistance(plan.total, settings.distanceUnit, lang)} · ${t('expectedFinish')}: ${formatDuration(estimateDuration(tpl.items) * 1000)}`
            : `${t('totalDuration')}: ${formatDuration(plan.total * 1000)} · ${t('expectedDistance')}: ${formatDistance(estimateDistance(tpl.items), settings.distanceUnit, lang)}`}
        </T>
      </Card>

      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <T variant="label" style={{ flex: 1 }}>{t('feedback')}</T>
          <Button variant="ghost" label={t('settings')} onPress={() => router.push('/settings')} />
        </View>
        <T>{`${t('tolerance')}: ${formatPace(lo, pu, lang)} – ${formatPace(hi, pu, lang)}`}</T>
        <T>{`${t('tooFastSound')}: ${SOUND_NAMES[lang][settings.feedback.soundFast]} · ${t('tooSlowSound')}: ${SOUND_NAMES[lang][settings.feedback.soundSlow]}`}</T>
        <T>{`${t('waitBetween')}: ${settings.coaching.cooldownSec} s`}</T>
        <Button variant="secondary" icon="sound" label={t('testSound')} loading={testing} onPress={async () => {
          setTesting(true);
          await testSound(settings.feedback.soundFast, settings.feedback.soundSlow, settings.feedback.volume).catch(() => undefined);
          setTesting(false);
        }} />
        <T variant="small">{t('testSoundNote')}</T>
      </Card>

      <Section title={t('gpsStatus')}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s }} accessible accessibilityLabel={`${t('gpsStatus')}: ${gpsText}`}>
          <Icon name={gpsTone === 'ok' ? 'check' : 'gps'} color={gpsTone === 'ok' ? colors.black : colors.warningText} />
          <T style={{ flex: 1 }}>{gpsText}</T>
        </View>
        {perm && !perm.foreground ? (
          <>
            <T variant="small">{t('locationWhy')}</T>
            {perm.canAskAgain ? (
              <Button icon="gps" label={t('allowLocation')} onPress={askPermission} />
            ) : (
              <Button variant="secondary" label={t('openSettings')} onPress={openAppSettings} />
            )}
          </>
        ) : null}
        {perm?.foreground && !perm.precise ? <Banner text={t('gpsApprox')} action={{ label: t('openSettings'), onPress: openAppSettings }} /> : null}
        {perm?.foreground && !perm.background ? (
          <Banner text={t('gpsNoBackground')} action={{ label: t('allowLocation'), onPress: askPermission }} />
        ) : null}
        {needGps && !gpsUsable ? <T variant="small">{t('gpsRequiredDistance')}</T> : null}
      </Section>

      {errors.length ? <Banner tone="danger" text={t('fixBeforeStart')} action={{ label: t('edit'), onPress: () => router.push({ pathname: '/builder', params: { id: tpl.id } }) }} /> : null}

      <Button
        big
        variant="accent"
        icon="play"
        label={t('start')}
        disabled={errors.length > 0 || runner.active || !gpsUsable}
        loading={starting && count == null}
        onPress={() => begin(true)}
      />
      {!needGps && !gpsUsable ? (
        <>
          <Button variant="secondary" label={t('gpsStartWithout')} disabled={errors.length > 0 || runner.active} onPress={() => begin(perm?.foreground === true)} />
          <T variant="small">{t('gpsStartWithoutNote')}</T>
        </>
      ) : null}

      <Modal visible={count != null} transparent animationType="fade" onRequestClose={() => undefined}>
        <View style={{ flex: 1, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center' }} accessibilityLiveRegion="assertive">
          <T style={{ fontFamily: fonts.display, fontSize: 160, color: colors.lime }} accessibilityLabel={`${t('countdown')} ${count}`}>
            {count}
          </T>
        </View>
      </Modal>
    </Screen>
  );
}
