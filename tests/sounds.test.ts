// A15/K23/K24: ti forskellige lokale lyde, hver højst 1,5 s, og varigheder der matcher koden.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_FEEDBACK, SOUND_DURATION_MS, SOUND_IDS } from '../src/core/settings';

function wavMs(file: string) {
  const b = readFileSync(file);
  const rate = b.readUInt32LE(24);
  const bytesPerSample = b.readUInt16LE(34) / 8;
  const channels = b.readUInt16LE(22);
  const dataSize = b.readUInt32LE(40);
  return (dataSize / (rate * bytesPerSample * channels)) * 1000;
}

describe('A15 Ti lyde', () => {
  const dir = join(__dirname, '..', 'assets', 'sounds');
  it('der er ti forskellige lydfiler plus en særskilt etapelyd', () => {
    const hashes = [...SOUND_IDS, 'STAGE'].map((id) =>
      createHash('sha1').update(readFileSync(join(dir, `${id.toLowerCase()}.wav`))).digest('hex')
    );
    expect(new Set(hashes).size).toBe(11);
  });
  it('hver lyd varer højst 1,5 s og svarer til varigheden i koden', () => {
    for (const id of [...SOUND_IDS, 'STAGE'] as const) {
      const ms = wavMs(join(dir, `${id.toLowerCase()}.wav`));
      expect(ms).toBeLessThanOrEqual(1500);
      expect(Math.abs(ms - SOUND_DURATION_MS[id])).toBeLessThan(2);
    }
  });
  it('standardforslag: B06 til For hurtigt og B05 til For langsomt', () => {
    expect(DEFAULT_FEEDBACK.soundFast).toBe('B06');
    expect(DEFAULT_FEEDBACK.soundSlow).toBe('B05');
  });
});
