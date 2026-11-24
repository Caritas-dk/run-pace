// Indstillinger: enheder, tolerance, bip, ventetid, sprog og data (K01, K18, K23, K24, K28, K48).
import { Stack } from 'expo-router';
import { Alert, Pressable, View } from 'react-native';
import { AppSettings, CoachingSettings, FeedbackSettings, SOUND_IDS, SoundId } from '../core/settings';
import { toMps, PaceUnit, paceUnitLabel } from '../core/units';
import { SOUND_NAMES } from '../i18n/strings';
import { playCue } from '../services/audio';
import * as db from '../storage/db';
import { useApp } from '../ui/AppContext';
import { Banner, Button, Card, IconButton, Screen, Section, Segmented, Stepper, T, Toggle } from '../ui/components';
import { ToleranceEditor } from '../ui/inputs';
import { colors, fonts, radius, space } from '../ui/theme';

export default function Settings() {
  const { t, settings, update, reload } = useApp();
  const lang = settings.lang;
  const c = settings.coaching;
  const f = settings.feedback;
  const setC = (patch: Partial<CoachingSettings>) => update({ coaching: { ...c, ...patch } });
  const setF = (patch: Partial<FeedbackSettings>) => update({ feedback: { ...f, ...patch } });

  const chooser = (id: SoundId, which: 'soundFast' | 'soundSlow', label: string) => {
    const sel = f[which] === id;
    return (
      <Pressable
        accessibilityRole="radio"
        accessibilityState={{ checked: sel }}
        accessibilityLabel={`${label}: ${SOUND_NAMES[lang][id]}`}
        onPress={() => setF({ [which]: id } as Partial<FeedbackSettings>)}
        style={{
          minWidth: 48,
          minHeight: 48,
          borderRadius: radius.m,
          borderWidth: 2,
          borderColor: colors.blue,
          backgroundColor: sel ? colors.blue : colors.white,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: space.s,
        }}
      >
        <T style={{ color: sel ? colors.white : colors.blue, fontFamily: fonts.semibold, fontSize: 14 }}>{label}</T>
      </Pressable>
    );
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: t('settings') }} />

      <Section title={t('language')}>
        <Segmented<AppSettings['lang']>
          label={t('language')}
          value={lang}
          onChange={(l) => update({ lang: l })}
          options={[
            { value: 'da', label: 'Dansk' },
            { value: 'en', label: 'English' },
          ]}
        />
      </Section>

      <Section title={t('units')}>
        <T variant="label">{t('paceUnit')}</T>
        <Segmented<PaceUnit>
          label={t('paceUnit')}
          value={settings.paceUnit}
          onChange={(u) => update({ paceUnit: u })}
          options={(['minkm', 'kmh', 'minmi', 'mph'] as PaceUnit[]).map((u) => ({ value: u, label: paceUnitLabel(u, lang) }))}
        />
        <T variant="label">{t('distanceUnit')}</T>
        <Segmented<AppSettings['distanceUnit']>
          label={t('distanceUnit')}
          value={settings.distanceUnit}
          onChange={(u) => update({ distanceUnit: u })}
          options={[
            { value: 'km', label: 'km' },
            { value: 'mi', label: lang === 'da' ? 'miles' : 'miles' },
          ]}
        />
      </Section>

      <Section title={t('tolerance')}>
        <Card>
          <ToleranceEditor value={c.tolerance} targetMps={toMps(360, 'minkm')} onChange={(tol) => setC({ tolerance: tol })} />
        </Card>
      </Section>

      <Section title={t('feedback')}>
        <Card>
          <T variant="label">{t('window')}</T>
          <Segmented<5 | 10 | 15>
            label={t('window')}
            value={c.windowSec}
            onChange={(w) => setC({ windowSec: w })}
            options={[5, 10, 15].map((v) => ({ value: v as 5 | 10 | 15, label: `${v} s` }))}
          />
          <Stepper label={t('deviation')} value={c.deviationSec} min={3} max={15} onChange={(v) => setC({ deviationSec: v })} format={(v) => `${v} s`} />
          <Stepper label={t('cooldown')} value={c.cooldownSec} min={10} max={180} step={5} onChange={(v) => setC({ cooldownSec: v })} format={(v) => `${v} s`} />
          <Stepper label={t('settle')} value={c.settleSec} min={5} max={30} onChange={(v) => setC({ settleSec: v })} format={(v) => `${v} s`} />
          <Stepper label={t('countdown')} value={settings.countdownSec} min={0} max={10} onChange={(v) => update({ countdownSec: v })} format={(v) => `${v} s`} />
        </Card>
      </Section>

      <Section title={t('sounds')}>
        <Card style={{ gap: space.xs }}>
          {f.soundFast === f.soundSlow ? <Banner text={t('sameSoundWarning')} /> : null}
          {SOUND_IDS.map((id) => (
            <View key={id} style={{ flexDirection: 'row', alignItems: 'center', gap: space.s, minHeight: 56 }}>
              <IconButton icon="sound" label={`${t('preview')}: ${SOUND_NAMES[lang][id]}`} onPress={() => playCue(id, f.volume)} />
              <T style={{ flex: 1 }}>{`${id} · ${SOUND_NAMES[lang][id]}`}</T>
              {chooser(id, 'soundFast', t('tooFastSound'))}
              {chooser(id, 'soundSlow', t('tooSlowSound'))}
            </View>
          ))}
          <Stepper
            label={t('volume')}
            value={Math.round(f.volume * 100)}
            min={10}
            max={100}
            step={10}
            onChange={(v) => setF({ volume: v / 100 })}
            format={(v) => `${v} %`}
          />
          <Toggle label={t('soundOn')} value={f.soundOn} onChange={(v) => setF({ soundOn: v })} />
          <Toggle label={t('vibration')} value={f.vibration} onChange={(v) => setF({ vibration: v })} />
          <Toggle label={t('speakStageSetting')} value={f.speakStage} onChange={(v) => setF({ speakStage: v })} />
          <Toggle
            label={t('speakerAfterLoss')}
            value={f.speakerAfterHeadphoneLoss}
            onChange={(v) => setF({ speakerAfterHeadphoneLoss: v })}
          />
        </Card>
      </Section>

      <Section title={t('data')}>
        <T variant="small">{t('dataLocal')}</T>
        <Toggle label={t('logsLocation')} value={settings.allowLocationInLogs} onChange={(v) => update({ allowLocationInLogs: v })} />
        <Button
          variant="danger"
          icon="trash"
          label={t('deleteAll')}
          onPress={() =>
            Alert.alert(t('deleteAll'), t('deleteAllConfirm'), [
              { text: t('cancel'), style: 'cancel' },
              {
                text: t('delete'),
                style: 'destructive',
                onPress: async () => {
                  await db.deleteAllData();
                  await reload();
                },
              },
            ])
          }
        />
      </Section>

      <Section title={t('about')}>
        <T variant="small">{t('aboutText')}</T>
      </Section>
    </Screen>
  );
}
