// K28: registrerer, når høretelefoner afbrydes. Modulet er valgfrit, så appen også kan køre
// i miljøer uden den native del (fx test).
import { requireOptionalNativeModule } from 'expo';

type Listener = (e: { headphones: boolean }) => void;
type Subscription = { remove(): void };

interface AudioRouteNative {
  isHeadphonesConnected(): boolean;
  addListener(event: 'onOutputLost', listener: Listener): Subscription;
}

const native = requireOptionalNativeModule<AudioRouteNative>('AudioRoute');

export function isHeadphonesConnected(): boolean | null {
  try {
    return native ? native.isHeadphonesConnected() : null;
  } catch {
    return null;
  }
}

export function addOutputLostListener(listener: Listener): Subscription {
  if (!native) return { remove() {} };
  return native.addListener('onOutputLost', listener);
}

export const audioRouteAvailable = !!native;
