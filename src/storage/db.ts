// K47/K48/K50: lokal opbevaring i appens private lager (SQLite). Ingen backend.
import * as SQLite from 'expo-sqlite';
import { WorkoutTemplate } from '../core/plan';
import { LogEvent, PaceSample, SessionEngine, StoredPoint } from '../core/session';
import { AppSettings, DEFAULT_SETTINGS, sanitizeSettings } from '../core/settings';
import { SessionResult } from '../core/stats';

const SCHEMA_VERSION = 1;
let db: SQLite.SQLiteDatabase | null = null;

function conn(): SQLite.SQLiteDatabase {
  if (!db) throw new Error('Databasen er ikke åbnet');
  return db;
}

export async function initDb(): Promise<void> {
  if (db) return;
  db = await SQLite.openDatabaseAsync('runpace.db');
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const v = row?.user_version ?? 0;
  if (v < 1) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS templates (
        id TEXT PRIMARY KEY NOT NULL,
        json TEXT NOT NULL,
        favorite INTEGER NOT NULL DEFAULT 0,
        quick INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY NOT NULL,
        json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY NOT NULL,
        template_id TEXT NOT NULL,
        plan_hash TEXT NOT NULL,
        started_at INTEGER NOT NULL,
        ended_at INTEGER,
        status TEXT NOT NULL,
        engine_json TEXT,
        result_json TEXT,
        checkpoint_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS points (
        session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        t INTEGER NOT NULL, lat REAL NOT NULL, lon REAL NOT NULL,
        acc REAL, alt REAL, speed REAL,
        valid INTEGER NOT NULL, reason TEXT, seg INTEGER NOT NULL, dist REAL NOT NULL
      );
      CREATE INDEX IF NOT EXISTS points_session ON points(session_id, t);
      CREATE TABLE IF NOT EXISTS events (
        session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        t INTEGER NOT NULL, active_ms INTEGER NOT NULL, stage INTEGER NOT NULL, kind TEXT NOT NULL, speed REAL
      );
      CREATE INDEX IF NOT EXISTS events_session ON events(session_id, t);
      CREATE TABLE IF NOT EXISTS samples (
        session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        a INTEGER NOT NULL, v REAL, target REAL NOT NULL, stage INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS samples_session ON samples(session_id, a);
    `);
  }
  if (v !== SCHEMA_VERSION) await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
}

// ---------- indstillinger ----------

export async function loadSettings(): Promise<AppSettings> {
  const row = await conn().getFirstAsync<{ json: string }>('SELECT json FROM settings WHERE key = ?', 'app');
  if (!row) return DEFAULT_SETTINGS;
  try {
    return sanitizeSettings(JSON.parse(row.json));
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(s: AppSettings): Promise<void> {
  await conn().runAsync('INSERT OR REPLACE INTO settings (key, json) VALUES (?, ?)', 'app', JSON.stringify(s));
}

// ---------- træningsskabeloner (K04) ----------

function parseTemplate(json: string): WorkoutTemplate | null {
  try {
    const t = JSON.parse(json) as WorkoutTemplate;
    if (!t || typeof t.id !== 'string' || !Array.isArray(t.items) || (t.unit !== 'distance' && t.unit !== 'time'))
      return null;
    return t;
  } catch {
    return null;
  }
}

export async function listTemplates(includeQuick = false): Promise<WorkoutTemplate[]> {
  const rows = await conn().getAllAsync<{ json: string }>(
    `SELECT json FROM templates ${includeQuick ? '' : 'WHERE quick = 0'} ORDER BY favorite DESC, updated_at DESC`
  );
  return rows.map((r) => parseTemplate(r.json)).filter((t): t is WorkoutTemplate => !!t);
}

export async function getTemplate(id: string): Promise<WorkoutTemplate | null> {
  const row = await conn().getFirstAsync<{ json: string }>('SELECT json FROM templates WHERE id = ?', id);
  return row ? parseTemplate(row.json) : null;
}

export async function saveTemplate(t: WorkoutTemplate): Promise<void> {
  await conn().runAsync(
    'INSERT OR REPLACE INTO templates (id, json, favorite, quick, updated_at) VALUES (?, ?, ?, ?, ?)',
    t.id,
    JSON.stringify(t),
    t.favorite ? 1 : 0,
    t.quick ? 1 : 0,
    t.updatedAt
  );
}

/** K16: sletning af en skabelon påvirker ikke gemte resultater og omvendt. */
export async function deleteTemplate(id: string): Promise<void> {
  await conn().runAsync('DELETE FROM templates WHERE id = ?', id);
}

// ---------- sessioner ----------

export async function createSession(e: SessionEngine): Promise<void> {
  await conn().runAsync(
    'INSERT INTO sessions (id, template_id, plan_hash, started_at, status, engine_json, checkpoint_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    e.cfg.id,
    e.plan.templateId,
    e.plan.hash,
    e.startedAt,
    'active',
    JSON.stringify(e.toJSON()),
    Date.now()
  );
}

/** K37: løbende lokal lagring. Kaldes mindst hvert 5. sekund under en tur. */
export async function checkpoint(
  e: SessionEngine,
  drained: ReturnType<SessionEngine['drain']> = e.drain()
): Promise<void> {
  const { points, events, samples } = drained;
  const d = conn();
  await d.withTransactionAsync(async () => {
    for (const p of points) await insertPoint(d, e.cfg.id, p);
    for (const ev of events) await insertEvent(d, e.cfg.id, ev);
    for (const s of samples) await insertSample(d, e.cfg.id, s);
    await d.runAsync(
      'UPDATE sessions SET engine_json = ?, checkpoint_at = ? WHERE id = ?',
      JSON.stringify(e.toJSON()),
      Date.now(),
      e.cfg.id
    );
  });
}

async function insertPoint(d: SQLite.SQLiteDatabase, id: string, p: StoredPoint) {
  await d.runAsync(
    'INSERT INTO points (session_id, t, lat, lon, acc, alt, speed, valid, reason, seg, dist) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    id,
    p.t,
    p.lat,
    p.lon,
    p.acc ?? null,
    p.alt ?? null,
    p.speed ?? null,
    p.valid ? 1 : 0,
    p.reason ?? null,
    p.seg,
    p.dist
  );
}
async function insertEvent(d: SQLite.SQLiteDatabase, id: string, ev: LogEvent) {
  await d.runAsync(
    'INSERT INTO events (session_id, t, active_ms, stage, kind, speed) VALUES (?, ?, ?, ?, ?, ?)',
    id,
    ev.t,
    Math.round(ev.activeMs),
    ev.stage,
    ev.kind,
    ev.speed ?? null
  );
}
async function insertSample(d: SQLite.SQLiteDatabase, id: string, s: PaceSample) {
  await d.runAsync(
    'INSERT INTO samples (session_id, a, v, target, stage) VALUES (?, ?, ?, ?, ?)',
    id,
    Math.round(s.a),
    s.v,
    s.target,
    s.stage
  );
}

export async function finalizeSession(e: SessionEngine, result: SessionResult): Promise<void> {
  await checkpoint(e);
  await conn().runAsync(
    'UPDATE sessions SET status = ?, ended_at = ?, result_json = ?, engine_json = NULL WHERE id = ?',
    result.endReason,
    result.endedAt,
    JSON.stringify(result),
    e.cfg.id
  );
}

/** K37: en tur, der ikke blev afsluttet (appen blev lukket). */
export async function getUnfinishedSession(): Promise<{ id: string; engine: SessionEngine; checkpointAt: number } | null> {
  const row = await conn().getFirstAsync<{ id: string; engine_json: string | null; checkpoint_at: number | null }>(
    "SELECT id, engine_json, checkpoint_at FROM sessions WHERE status = 'active' ORDER BY started_at DESC LIMIT 1"
  );
  if (!row || !row.engine_json) return null;
  try {
    return { id: row.id, engine: SessionEngine.fromJSON(JSON.parse(row.engine_json)), checkpointAt: row.checkpoint_at ?? 0 };
  } catch {
    // Ugyldige data (K50): fjern dem, så appen ikke sidder fast.
    await deleteSession(row.id);
    return null;
  }
}

export interface ResultRow {
  id: string;
  result: SessionResult;
}

export async function listResults(limit = 500): Promise<ResultRow[]> {
  const rows = await conn().getAllAsync<{ id: string; result_json: string }>(
    "SELECT id, result_json FROM sessions WHERE status IN ('completed', 'aborted') AND result_json IS NOT NULL ORDER BY started_at DESC LIMIT ?",
    limit
  );
  const out: ResultRow[] = [];
  for (const r of rows) {
    try {
      out.push({ id: r.id, result: JSON.parse(r.result_json) });
    } catch {
      // spring over beskadigede rækker
    }
  }
  return out;
}

export async function getResult(id: string): Promise<SessionResult | null> {
  const row = await conn().getFirstAsync<{ result_json: string | null }>('SELECT result_json FROM sessions WHERE id = ?', id);
  if (!row?.result_json) return null;
  try {
    return JSON.parse(row.result_json);
  } catch {
    return null;
  }
}

export async function getRoute(id: string): Promise<{ lat: number; lon: number; seg: number }[]> {
  return conn().getAllAsync('SELECT lat, lon, seg FROM points WHERE session_id = ? AND valid = 1 ORDER BY t', id);
}

export async function getEvents(id: string): Promise<LogEvent[]> {
  const rows = await conn().getAllAsync<{ t: number; active_ms: number; stage: number; kind: string; speed: number | null }>(
    'SELECT t, active_ms, stage, kind, speed FROM events WHERE session_id = ? ORDER BY t',
    id
  );
  return rows.map((r) => ({ t: r.t, activeMs: r.active_ms, stage: r.stage, kind: r.kind as LogEvent['kind'], speed: r.speed }));
}

export async function getSamples(id: string): Promise<PaceSample[]> {
  return conn().getAllAsync('SELECT a, v, target, stage FROM samples WHERE session_id = ? ORDER BY a', id);
}

export async function deleteSession(id: string): Promise<void> {
  const d = conn();
  await d.withTransactionAsync(async () => {
    await d.runAsync('DELETE FROM points WHERE session_id = ?', id);
    await d.runAsync('DELETE FROM events WHERE session_id = ?', id);
    await d.runAsync('DELETE FROM samples WHERE session_id = ?', id);
    await d.runAsync('DELETE FROM sessions WHERE id = ?', id);
  });
}

/** K48: slet alle data. */
export async function deleteAllData(): Promise<void> {
  await conn().execAsync(
    'DELETE FROM points; DELETE FROM events; DELETE FROM samples; DELETE FROM sessions; DELETE FROM templates; DELETE FROM settings;'
  );
}
