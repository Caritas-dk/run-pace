// Historik: træninger efter dato, detaljer, sammenligning og sletning (K45, K48).
import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import { formatDistance, formatDuration, formatPace } from '../core/units';
import * as db from '../storage/db';
import { useApp } from '../ui/AppContext';
import { Button, EmptyState, ListRow, Screen, T } from '../ui/components';
import { colors } from '../ui/theme';

export default function History() {
  const { t, settings, reload } = useApp();
  const [rows, setRows] = useState<db.ResultRow[]>([]);
  const load = useCallback(async () => setRows(await db.listResults()), []);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );
  const lang = settings.lang;

  return (
    <Screen>
      <Stack.Screen options={{ title: t('history') }} />
      {rows.length === 0 ? <EmptyState text={t('noResults')} /> : null}
      {rows.map(({ id, result: r }) => (
        <ListRow
          key={id}
          title={`${new Date(r.startedAt).toLocaleDateString(lang === 'da' ? 'da-DK' : 'en-GB')} · ${r.templateName}`}
          subtitle={[
            formatDistance(r.distanceM, settings.distanceUnit, lang),
            formatDuration(r.activeMs),
            r.avgMps ? formatPace(r.avgMps, settings.paceUnit, lang) : null,
            r.share ? `${Math.round(r.share.inPct)} % ${t('inZone').toLowerCase()}` : null,
            r.endReason === 'aborted' ? t('aborted') : null,
          ]
            .filter(Boolean)
            .join(' · ')}
          onPress={() => router.push({ pathname: '/result/[id]', params: { id } })}
        />
      ))}
      {rows.length ? <T variant="small">{t('learningNote')}</T> : null}
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
                load();
              },
            },
          ])
        }
      />
      <T variant="small" style={{ color: colors.textMuted }}>{t('dataLocal')}</T>
    </Screen>
  );
}
