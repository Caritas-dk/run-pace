// Binder motor, GPS, lyd og lager sammen under en tur. Én aktiv tur ad gangen.
import { AppState } from 'react-native';
import { addOutputLostListener } from '../../modules/audio-route';
import { RawPoint } from '../core/gps';
import { freezePlan, newId, WorkoutTemplate } from '../core/plan';
import { EngineEvent, SessionEngine, Snapshot } from '../core/session';
import { AppSettings } from '../core/settings';
import { buildResult } from '../core/stats';
import { formatPace } from '../core/units';
import { translate } from '../i18n/strings';
import * as db from '../storage/db';
import { configureAudio, playCue, preloadSounds, speak, stopSpeech, vibrate } from './audio';
import { setLocationHandler, startTracking, stopTracking } from './location';

export interface RunnerState {
  snapshot: Snapshot | null;
  sessionId: string | null;
  /** K28: signaler slået fra efter tab af høretelefoner. */
  headphonesLost: boolean;
  soundOn: boolean;
  tracking: 'background' | 'foreground' | 'none';
  finishedResultId: string | null;
}

type Listener = (s: RunnerState) => void;

const CHECKPOINT_MS = 2000; // K37: højst 5 s modtagne målinger må gå tabt

class Runner {
  engine: SessionEngine | null = null;
  settings: AppSettings | null = null;
  state: RunnerState = {
    snapshot: null,
    sessionId: null,
    headphonesLost: false,
    soundOn: true,
    tracking: 'none',
    finishedResultId: null,
  };
  private listeners = new Set<Listener>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastCheckpoint = 0;
  private checkpointing = false;
  private routeSub: { remove(): void } | null = null;
  private appStateSub: { remove(): void } | null = null;

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    l(this.state);
    return () => this.listeners.delete(l);
  }

  private emit(patch: Partial<RunnerState> = {}) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l(this.state));
  }

  get active() {
    return !!this.engine && this.engine.status !== 'finished';
  }

  async start(template: WorkoutTemplate, settings: AppSettings, gpsEnabled: boolean): Promise<string> {
    if (this.active) throw new Error('En tur er allerede i gang');
    const now = Date.now();
    const plan = freezePlan(template);
    this.settings = settings;
    this.engine = new SessionEngine(
      {
        id: newId('ses'),
        plan,
        coaching: JSON.parse(JSON.stringify(settings.coaching)),
        feedback: JSON.parse(JSON.stringify(settings.feedback)),
        splitUnit: settings.distanceUnit,
        gpsEnabled,
      },
      now
    );
    await db.createSession(this.engine);
    await this.attach(gpsEnabled);
    return this.engine.cfg.id;
  }

  /** Fælles opsætning ved start og genoptagelse. */
  private async attach(gpsEnabled: boolean) {
    const e = this.engine!;
    this.state = {
      snapshot: e.snapshot(Date.now()),
      sessionId: e.cfg.id,
      headphonesLost: false,
      soundOn: e.cfg.feedback.soundOn,
      tracking: 'none',
      finishedResultId: null,
    };
    preloadSounds();
    configureAudio().catch(() => undefined);
    setLocationHandler((pts) => this.onPoints(pts));
    let tracking: RunnerState['tracking'] = 'none';
    if (gpsEnabled) {
      const lang = this.settings?.lang ?? 'da';
      tracking = await startTracking({
        title: 'Run Pace',
        body: translate(lang, 'stageXofY', { x: e.stageIndex + 1, y: e.plan.stages.length }),
      });
    }
    this.routeSub?.remove();
    this.routeSub = addOutputLostListener(() => this.onHeadphonesLost());
    this.appStateSub?.remove();
    this.appStateSub = AppState.addEventListener('change', (s) => {
      if (s === 'active') this.tick();
      else this.checkpoint(true);
    });
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => this.tick(), 1000);
    this.emit({ tracking });
  }

  private onPoints(pts: RawPoint[]) {
    const e = this.engine;
    if (!e || e.status === 'finished') return;
    const now = Date.now();
    const events: EngineEvent[] = [];
    for (const p of pts) events.push(...e.addPoint(p, now));
    events.push(...e.tick(now));
    this.handle(events);
  }

  tick() {
    const e = this.engine;
    if (!e) return;
    const events = e.tick(Date.now());
    this.handle(events);
  }

  private handle(events: EngineEvent[]) {
    const e = this.engine;
    if (!e) return;
    const fb = e.cfg.feedback;
    const lang = this.settings?.lang ?? 'da';
    const canPlay = this.state.soundOn && !this.state.headphonesLost;
    // K22: etapeskift har prioritet over korrektion i samme opdatering.
    const hasStage = events.some((x) => x.type === 'stage');
    for (const ev of events) {
      if (ev.type === 'cue' && !hasStage) {
        const id = ev.dir === 'fast' ? fb.soundFast : fb.soundSlow;
        if (fb.vibration) vibrate(ev.dir);
        if (canPlay) {
          playCue(id, fb.volume).then((ok) => {
            if (!ok) this.engine?.cueSkipped(Date.now());
          });
        }
      } else if (ev.type === 'stage') {
        if (fb.vibration) vibrate('stage');
        if (canPlay) {
          playCue('STAGE', fb.volume).then(() => {
            if (fb.speakStage && this.engine) {
              const st = this.engine.plan.stages[ev.index];
              speak(
                translate(lang, 'speakStage', {
                  n: ev.index + 1,
                  pace: formatPace(st.targetMps, this.settings?.paceUnit ?? 'minkm', lang),
                }),
                lang
              );
            }
          });
        }
      } else if (ev.type === 'finish') {
        if (canPlay && ev.reason === 'completed') playCue('STAGE', fb.volume);
        this.finalize();
        return;
      }
    }
    this.emit({ snapshot: e.snapshot(Date.now()) });
    this.checkpoint(false);
  }

  private async checkpoint(force: boolean) {
    const e = this.engine;
    if (!e || e.status === 'finished' || this.checkpointing) return;
    const now = Date.now();
    if (!force && now - this.lastCheckpoint < CHECKPOINT_MS) return;
    this.checkpointing = true;
    this.lastCheckpoint = now;
    const drained = e.drain();
    try {
      await db.checkpoint(e, drained);
    } catch {
      // Læg data tilbage i udbakken, så de gemmes ved næste forsøg.
      e.outPoints.unshift(...drained.points);
      e.outEvents.unshift(...drained.events);
      e.outSamples.unshift(...drained.samples);
    } finally {
      this.checkpointing = false;
    }
  }

  pause() {
    this.engine?.pause(Date.now());
    this.handle([]);
  }

  resume() {
    this.engine?.resume(Date.now());
    this.handle([]);
  }

  setSoundOn(on: boolean) {
    this.emit({ soundOn: on });
  }

  /** K28: automatisk skift til højttaler kræver et aktivt brugervalg. */
  useSpeaker() {
    this.emit({ headphonesLost: false });
  }

  private onHeadphonesLost() {
    if (!this.active) return;
    const allowSpeaker = this.engine?.cfg.feedback.speakerAfterHeadphoneLoss;
    if (!allowSpeaker) this.emit({ headphonesLost: true });
  }

  /** K16: stop før målet. save=false kasserer turen helt. */
  async stop(save: boolean): Promise<string | null> {
    const e = this.engine;
    if (!e) return null;
    if (e.status !== 'finished') e.stop(Date.now());
    if (!save) {
      await this.teardown();
      await db.deleteSession(e.cfg.id);
      this.engine = null;
      this.emit({ snapshot: null, sessionId: null, finishedResultId: null });
      return null;
    }
    return this.finalize();
  }

  private finalizing: Promise<string | null> | null = null;

  private finalize(): Promise<string | null> {
    if (this.finalizing) return this.finalizing;
    this.finalizing = (async () => {
      const e = this.engine;
      if (!e) return null;
      await this.teardown();
      while (this.checkpointing) await new Promise((r) => setTimeout(r, 50));
      try {
        const result = buildResult(e);
        await db.finalizeSession(e, result);
        this.emit({ snapshot: e.snapshot(Date.now()), finishedResultId: e.cfg.id });
        return e.cfg.id;
      } finally {
        this.finalizing = null;
      }
    })();
    return this.finalizing;
  }

  private async teardown() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    setLocationHandler(null);
    this.routeSub?.remove();
    this.routeSub = null;
    this.appStateSub?.remove();
    this.appStateSub = null;
    stopSpeech();
    await stopTracking();
    this.emit({ tracking: 'none' });
  }

  /** Ryd en afsluttet tur fra hukommelsen, når resultatet er vist. */
  clearFinished() {
    if (this.engine?.status === 'finished') {
      this.engine = null;
      this.emit({ snapshot: null, sessionId: null, finishedResultId: null });
    }
  }

  /** K37: gendan efter nedbrud. */
  async recover(engine: SessionEngine, checkpointAt: number, mode: 'resume' | 'save', settings: AppSettings) {
    this.settings = settings;
    this.engine = engine;
    if (mode === 'save') {
      engine.stop(Math.max(engine.startedAt, checkpointAt));
      await this.finalize();
      return engine.cfg.id;
    }
    engine.recoverResume(Date.now());
    await this.attach(engine.cfg.gpsEnabled);
    return engine.cfg.id;
  }
}

export const runner = new Runner();
