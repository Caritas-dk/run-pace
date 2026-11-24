import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { AppSettings, DEFAULT_SETTINGS } from '../core/settings';
import { StringKey, translate } from '../i18n/strings';
import * as db from '../storage/db';

interface Ctx {
  settings: AppSettings;
  update: (patch: Partial<AppSettings>) => Promise<void>;
  replace: (s: AppSettings) => Promise<void>;
  t: (key: StringKey, params?: Record<string, string | number>) => string;
  reload: () => Promise<void>;
}

const AppCtx = createContext<Ctx | null>(null);

export function AppProvider({ initial, children }: { initial: AppSettings; children: React.ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(initial);

  const replace = useCallback(async (s: AppSettings) => {
    setSettings(s);
    await db.saveSettings(s);
  }, []);

  const update = useCallback(
    async (patch: Partial<AppSettings>) => {
      const next = { ...settings, ...patch };
      await replace(next);
    },
    [settings, replace]
  );

  const reload = useCallback(async () => {
    setSettings(await db.loadSettings());
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      settings,
      update,
      replace,
      reload,
      t: (key, params) => translate(settings.lang, key, params),
    }),
    [settings, update, replace, reload]
  );
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export function useApp(): Ctx {
  const c = useContext(AppCtx);
  if (!c) return { settings: DEFAULT_SETTINGS, update: async () => {}, replace: async () => {}, reload: async () => {}, t: (k, p) => translate('da', k, p) };
  return c;
}
