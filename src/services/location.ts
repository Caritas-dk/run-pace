// K29, K36, K49: lokationstilladelser, GPS-status og registrering i baggrunden.
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Linking, Platform } from 'react-native';
import { RawPoint } from '../core/gps';

export const LOCATION_TASK = 'runpace-location-updates';

type LocationHandler = (points: RawPoint[]) => void;
let handler: LocationHandler | null = null;
let foregroundSub: Location.LocationSubscription | null = null;

export function setLocationHandler(h: LocationHandler | null) {
  handler = h;
}

export function toRawPoint(l: Location.LocationObject): RawPoint {
  return {
    t: l.timestamp,
    lat: l.coords.latitude,
    lon: l.coords.longitude,
    acc: l.coords.accuracy,
    alt: l.coords.altitude,
    speed: l.coords.speed != null && l.coords.speed >= 0 ? l.coords.speed : null,
  };
}

// Opgaven skal defineres i modulets globale scope, så den findes, når systemet vækker appen.
if (!TaskManager.isTaskDefined(LOCATION_TASK)) {
  TaskManager.defineTask<{ locations: Location.LocationObject[] }>(LOCATION_TASK, async ({ data, error }) => {
    if (error || !data?.locations?.length) return;
    const pts = data.locations.map(toRawPoint).sort((a, b) => a.t - b.t);
    handler?.(pts);
  });
}

export type PermissionState = {
  servicesEnabled: boolean;
  foreground: boolean;
  background: boolean;
  /** Præcis position (iOS 'full', Android 'fine'). */
  precise: boolean;
  canAskAgain: boolean;
};

export async function getPermissionState(): Promise<PermissionState> {
  const [servicesEnabled, fg, bg] = await Promise.all([
    Location.hasServicesEnabledAsync().catch(() => false),
    Location.getForegroundPermissionsAsync(),
    Location.getBackgroundPermissionsAsync().catch(() => null),
  ]);
  return {
    servicesEnabled,
    foreground: fg.granted,
    background: !!bg?.granted,
    precise: isPrecise(fg),
    canAskAgain: fg.canAskAgain,
  };
}

function isPrecise(p: Location.LocationPermissionResponse): boolean {
  if (!p.granted) return false;
  if (Platform.OS === 'ios') return (p.ios?.accuracy ?? 'full') === 'full';
  if (Platform.OS === 'android') return (p.android?.accuracy ?? 'fine') === 'fine';
  return true;
}

/** Spørger først om forgrundsadgang og derefter om baggrundsadgang (krævet for låst skærm). */
export async function requestPermissions(): Promise<PermissionState> {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.granted) {
    try {
      await Location.requestBackgroundPermissionsAsync();
    } catch {
      // nogle platforme kan ikke spørge om baggrund lige nu; håndteres i visningen
    }
  }
  return getPermissionState();
}

export function openAppSettings() {
  Linking.openSettings().catch(() => undefined);
}

/** Starter registrering. Med baggrundsadgang via TaskManager (fortsætter med låst skærm). */
export async function startTracking(notification: { title: string; body: string }): Promise<'background' | 'foreground'> {
  const perm = await getPermissionState();
  if (perm.background) {
    await Location.startLocationUpdatesAsync(LOCATION_TASK, {
      accuracy: Location.Accuracy.BestForNavigation,
      timeInterval: 1000,
      distanceInterval: 0,
      activityType: Location.ActivityType.Fitness,
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: notification.title,
        notificationBody: notification.body,
        notificationColor: '#2F5D8A',
        killServiceOnDestroy: false,
      },
    });
    return 'background';
  }
  foregroundSub = await Location.watchPositionAsync(
    { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 0 },
    (l) => handler?.([toRawPoint(l)])
  );
  return 'foreground';
}

/** K49: stop lokationsregistrering ved afslutning eller kassering. */
export async function stopTracking(): Promise<void> {
  foregroundSub?.remove();
  foregroundSub = null;
  try {
    if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK)) await Location.stopLocationUpdatesAsync(LOCATION_TASK);
  } catch {
    // opgaven var ikke startet
  }
}

/** GPS-forhåndsvisning på Klar til start-skærmen (K29). */
export async function watchPreview(cb: (p: RawPoint) => void): Promise<() => void> {
  const sub = await Location.watchPositionAsync(
    { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 0 },
    (l) => cb(toRawPoint(l))
  );
  return () => sub.remove();
}
