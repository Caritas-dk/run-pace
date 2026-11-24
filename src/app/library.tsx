// K04: træningsbibliotek – gem, redigér, kopiér, slet og favoritter.
import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { deepCopyTemplate, WorkoutTemplate } from '../core/plan';
import * as db from '../storage/db';
import { useApp } from '../ui/AppContext';
import { Button, Card, EmptyState, IconButton, Screen, T } from '../ui/components';
import { describeTemplate } from '../ui/format';
import { colors, fonts, space } from '../ui/theme';

export default function Library() {
  const { t, settings } = useApp();
  const [list, setList] = useState<WorkoutTemplate[]>([]);

  const load = useCallback(async () => setList(await db.listTemplates()), []);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const toggleFav = async (x: WorkoutTemplate) => {
    await db.saveTemplate({ ...x, favorite: !x.favorite, updatedAt: Date.now() });
    load();
  };
  const copy = async (x: WorkoutTemplate) => {
    await db.saveTemplate(deepCopyTemplate(x, t('copyOf', { name: x.name }), Date.now()));
    load();
  };
  const remove = (x: WorkoutTemplate) =>
    Alert.alert(t('confirmDelete', { name: x.name }), t('confirmDeleteBody'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('delete'),
        style: 'destructive',
        onPress: async () => {
          await db.deleteTemplate(x.id);
          load();
        },
      },
    ]);

  return (
    <Screen>
      <Stack.Screen options={{ title: t('workouts') }} />
      <Button icon="plus" label={t('newWorkout')} onPress={() => router.push('/builder')} />
      {list.length === 0 ? <EmptyState text={t('noWorkouts')} /> : null}
      {list.map((x) => (
        <Card key={x.id} style={{ gap: space.s }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${x.name}, ${describeTemplate(x, settings)}`}
            onPress={() => router.push({ pathname: '/ready', params: { id: x.id } })}
            style={{ minHeight: 48, justifyContent: 'center' }}
          >
            <T style={{ fontFamily: fonts.bold, fontSize: 18 }}>{x.name}</T>
            <T variant="small">{describeTemplate(x, settings)}</T>
          </Pressable>
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
            <IconButton
              icon={x.favorite ? 'star' : 'starOutline'}
              label={`${t('favorite')}: ${x.favorite ? t('yes') : t('no')}`}
              color={colors.blue}
              onPress={() => toggleFav(x)}
            />
            <IconButton icon="edit" label={t('edit')} onPress={() => router.push({ pathname: '/builder', params: { id: x.id } })} />
            <IconButton icon="copy" label={t('copy')} onPress={() => copy(x)} />
            <IconButton icon="trash" label={t('delete')} color={colors.danger} onPress={() => remove(x)} />
          </View>
        </Card>
      ))}
    </Screen>
  );
}
