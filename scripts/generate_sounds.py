"""Genererer Run Pace' signallyde (B01-B10 og etapeskift) som 16-bit mono WAV.
Lydene er syntetiseret her og ejes af projektet (ingen tredjepartsrettigheder).
Kør: python3 scripts/generate_sounds.py"""
import math, struct, wave, os, sys

SR = 44100
OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'sounds')

def tone(freq, ms, wave_='sine', decay=None, attack=12, release=25, harmonics=None):
    n = int(SR * ms / 1000)
    out = []
    for i in range(n):
        t = i / SR
        if wave_ == 'sine':
            v = math.sin(2 * math.pi * freq * t)
        elif wave_ == 'triangle':
            v = 2 / math.pi * math.asin(math.sin(2 * math.pi * freq * t))
        elif wave_ == 'soft_square':
            v = sum(math.sin(2 * math.pi * freq * k * t) / k for k in (1, 3, 5)) * 0.8
        if harmonics:
            v = v + sum(a * math.sin(2 * math.pi * freq * h * t) for h, a in harmonics)
        env = 1.0
        a = SR * attack / 1000
        r = SR * release / 1000
        if i < a: env *= i / a
        if i > n - r: env *= max(0.0, (n - i) / r)
        if decay: env *= math.exp(-t / decay)
        out.append(v * env)
    return out

def silence(ms):
    return [0.0] * int(SR * ms / 1000)

def glide(f0, f1, ms):
    n = int(SR * ms / 1000); out = []; ph = 0.0
    for i in range(n):
        f = f0 + (f1 - f0) * i / n
        ph += 2 * math.pi * f / SR
        env = min(1, i / (SR * 0.012), (n - i) / (SR * 0.025))
        out.append(math.sin(ph) * env)
    return out

def norm(x, peak=0.7):
    m = max(abs(v) for v in x) or 1
    return [v / m * peak for v in x]

S = {
 'B01': tone(1320, 220),
 'B02': tone(440, 260),
 'B03': tone(1320, 150) + silence(120) + tone(1320, 150),
 'B04': tone(440, 170) + silence(120) + tone(440, 170),
 # B05 Stigende: fire bip, der bliver gradvist lysere (Øg tempoet)
 'B05': tone(523.25, 190) + silence(50) + tone(659.25, 190) + silence(50) + tone(783.99, 190) + silence(50) + tone(1046.5, 190),
 # B06 Faldende: fire bip, der bliver gradvist mørkere (Sænk tempoet)
 'B06': tone(1046.5, 190) + silence(50) + tone(783.99, 190) + silence(50) + tone(659.25, 190) + silence(50) + tone(523.25, 190),
 'B07': tone(880, 700, decay=0.22, attack=3, release=60, harmonics=[(2.76, 0.35), (5.4, 0.15)]),
 'B08': tone(1000, 120, 'soft_square') + silence(80) + tone(1000, 120, 'soft_square') + silence(80) + tone(1000, 120, 'soft_square'),
 'B09': tone(660, 900, attack=180, release=300),
 'B10': tone(880, 120) + silence(80) + tone(880, 360) + silence(80) + tone(880, 120),
 'STAGE': tone(659.25, 300, 'triangle', decay=0.5) + silence(100) + tone(880, 300, 'triangle', decay=0.5) + silence(100) + tone(1174.66, 300, 'triangle', decay=0.5),
}

os.makedirs(OUT, exist_ok=True)
for name, x in S.items():
    x = norm(x)
    ms = len(x) * 1000 / SR
    assert ms <= 1500, (name, ms)
    with wave.open(os.path.join(OUT, f'{name.lower()}.wav'), 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes(b''.join(struct.pack('<h', int(v * 32767)) for v in x))
    print(name, round(ms))
