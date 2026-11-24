# Run Pace

Løbeapp til iOS og Android, der lærer løberen at holde et stabilt tempo. Brugeren vælger et måltempo eller bygger en træning med flere etaper. Appen giver diskrete lydsignaler, når tempoet vedvarende ligger uden for tolerancen, og musik fra en anden app spiller videre imens.

Udviklet efter *Run Pace kravspecifikation v1.0* (TEAM INGBERG, 24. november 2026). Specifikationen bruger K-numre for krav og A-numre for accepttest, og dem henviser koden også til.

## Teknologi

| Del | Valg |
| --- | --- |
| Ramme | Expo SDK 58 · React Native 0.88 · TypeScript · Expo Router |
| GPS | `expo-location` med baggrundsopgave via `expo-task-manager` (forgrundstjeneste på Android) |
| Lyd | `expo-audio` med `interruptionMode: 'duckOthers'`: kortvarig dæmpning, og sessionen frigives efter hvert signal |
| Høretelefoner | Lokalt native modul `modules/audio-route` (Swift og Kotlin) |
| Lager | `expo-sqlite` i appens private lager. Ingen backend og ingen konto |
| Test | Vitest. Kernelogikken er ren TypeScript uden afhængighed af telefonen |

## Kom i gang

```bash
npm install
npm test            # 38 automatiske test af beregning og coaching (A01-A20)
npm run typecheck
npm run lint
```

Appen bruger native moduler, så den kører **ikke** i Expo Go. Byg den på én af disse måder:

```bash
# Lokalt (kræver Xcode på en Mac eller Android Studio)
npx expo run:ios --device
npx expo run:android --device

# I skyen med EAS (kræver gratis Expo-konto)
npx eas-cli@latest build --profile preview --platform android   # installerbar .apk
npx eas-cli@latest build --profile preview --platform ios       # intern distribution (kræver Apple Developer-konto)
```

Mapperne `ios/` og `android/` genereres af `npx expo prebuild` ud fra `app.json` og skal ikke redigeres manuelt.

Lydene kan genskabes med `npm run sounds`. De er syntetiseret af `scripts/generate_sounds.py` og ejes af projektet.

## Struktur

```
src/
  core/        Ren logik uden telefonafhængighed (fuldt testet)
    units.ts       K05/K06 enheder og konvertering
    tolerance.ts   K18 tolerancegrænser i m/s
    plan.ts        K07-K11 skabeloner, etaper, gentagelser, validering
    gps.ts         K30-K34 filtrering, distance, huller, udjævning
    coach.ts       K17-K22 afvigelse, ventetid, Stabil-tilstand
    session.ts     K12-K16, K29-K37 tilstandsmaskine for en tur
    stats.ts       K43-K46 resultat, tid i målzone, læring
  services/    Lyd, lokation og runner (binder motor, GPS, lyd og lager sammen)
  storage/     SQLite (K47/K48)
  app/         Skærme (Expo Router)
  ui/          Tema, komponenter, inputfelter, grafer
modules/audio-route/   Native modul: tab af høretelefoner (K28)
tests/         Accepttest med simulerede målesignaler
assets/        Maskot, ikoner, splash, skrifttype, lyde
```

Motoren (`SessionEngine`) er deterministisk. Den modtager GPS-punkter og tidsimpulser og returnerer hændelser (korrektion, etapeskift, slut). Derfor kan alle timing-regler testes med kontrollerede signaler, som specifikationen kræver.

## Accepttest

| Test | Dækning |
| --- | --- |
| A01-A13 | Automatisk (`tests/calc.test.ts`, `tests/coaching.test.ts`) |
| A15 | Automatisk for filer og varighed (`tests/sounds.test.ts`). Lyt også på telefon |
| A16-A20 | Logikken er testet automatisk. A17 og A19 skal også prøves fysisk |
| A14, A21, A22, A23 | Kræver fysisk test på telefoner. Se tjeklisten nedenfor |

## Kravsporing

✅ implementeret og automatisk testet · 🔧 implementeret, skal verificeres på fysisk telefon · ⚠️ delvist eller med kendt begrænsning

| Krav | Status | Hvor |
| --- | --- | --- |
| K01 Platforme, dansk/engelsk, enheder uafhængigt | ✅ | `i18n/strings.ts`, Indstillinger |
| K02 Uden konto og internet | ✅ | Ingen netværkskald. Ruten tegnes uden kortfliser |
| K03 Hurtig start / Byg træning | ✅ | `app/quick.tsx`, `app/builder.tsx` |
| K04 Bibliotek, favoritter, fast kopi | ✅ | `app/library.tsx`, `freezePlan` |
| K05-K06 Fire enheder, konvertering | ✅ | `core/units.ts` (A01) |
| K07 0,10-50,00 km, etapesum | ✅ | `validateTemplate` (A02, A03) |
| K08 Tidsopdelt, estimat ≤ 50 km | ✅ | `estimateDistance` |
| K09-K10 Etaper og gentagelser, ≤ 200 | ✅ | Bygger og `expandItems` (A04) |
| K11 Overblik og fejl ved felt | ✅ | Bygger og Klar til start |
| K12 Automatiske skift, overskud, kumulativt | ✅ | `session.ts` (A12) |
| K13 Særskilt skiftelyd, valgfri tale | 🔧 | `stage.wav`, `expo-speech` |
| K14 Afslutning ved beregnet grænse | ✅ | (A18) |
| K15 Pause | ✅ | (A16) |
| K16 Stop før målet, gem eller kassér | ✅ | Langt tryk på Stop, derefter bekræftelse |
| K17-K22 Coaching | ✅ | `coach.ts` (A05-A11) |
| K23-K24 Ti lyde, standard B06/B05, ≤ 1,5 s | ✅ | (A15) |
| K25-K27 Musik, kort dæmpning, Test lyd | 🔧 | `services/audio.ts` (A14) |
| K28 Opkald, høretelefoner | 🔧 | Signal annulleres, hvis det ikke starter inden 1 s, og `audio-route` registrerer tab af høretelefoner (A22) |
| K29 GPS-start | ✅/🔧 | Klar til start. Tidstræning kan startes uden GPS |
| K30-K34 Målinger, filtrering, huller, stilstand | ✅ | `gps.ts` (A13, A17) |
| K35 Tidsbegreber | ✅ | (A16) |
| K36 Låst skærm | 🔧 ⚠️ | Se begrænsninger |
| K37 Genopretning ≤ 5 s | ✅/🔧 | Gemmes hvert 2. s (A19) |
| K38-K40 Skærme, farver, tilgængelighed | 🔧 | Trykflader ≥ 48, ikon og tekst ved alle statusser, oplæsningsetiketter |
| K41-K42 Maskot og splash | ✅ | Godkendt splash version A |
| K43-K46 Resultat, målzone, læring, gemte indstillinger | ✅ | `stats.ts`, `app/result/[id].tsx` (A20) |
| K47-K48 Datamodel og lokal lagring, slet | ✅ | `storage/db.ts` |
| K49 Tilladelser | 🔧 | Afvisning, omtrentlig position og manglende “Altid” vises tydeligt |
| K50 Udvidelser, validering af data | ✅ | Skemaversion, validering ved indlæsning |
| K51 Ydeevne | 🔧 | Visning 1 Hz, lyde forudindlæst |
| K52-K53 Batteri og nøjagtighed | 🔧 | Kræver målinger på referenceenheder |
| K54 Kvalitetsansvar | ✅/🔧 | Automatiske test plus tjekliste |

## Kendte begrænsninger

- **Ikke bygget eller afprøvet på telefon endnu.** Koden er typetjekket og lintet, og JavaScript-pakken er bygget for begge platforme. De native builds og native modulet `audio-route` er dog ikke kompileret (det kræver Xcode og Android SDK). Kør det første EAS-build tidligt, som K50 anbefaler.
- **Tidsopdelt træning uden GPS med låst skærm (iOS):** Uden lokationsopdateringer kan iOS sætte appen på pause. Så kommer etapeskift først, når appen vækkes igen. Tiderne beregnes dog korrekt. Med GPS slået til vækkes appen hvert sekund.
- **Android 12+ og lydfokus i baggrunden** forudsætter, at lokationens forgrundstjeneste kører. Det skal verificeres (A23).
- **Splash på iOS** bruger `enableFullScreenImage_legacy` i `expo-splash-screen`. Funktionen fjernes i en senere SDK og skal så erstattes af et eget storyboard. Filerne fra splash-pakken kan bruges til det.
- **Tale og vibration** i baggrunden afhænger af platformen og er valgfri. Begge er slået fra som standard.
- F-funktioner (F01-F10) er ikke med.

## Fysisk tjekliste (før accepttest)

1. A14/A23: Spotify og Apple Music, låst skærm, Bluetooth-høretelefoner, 60 minutter. Musik ned, bip, musik op, og musikken må ikke forblive dæmpet.
2. A22: Telefonopkald under en tur må ikke give alarmer i kø. Afbrydes høretelefonerne, skal signalerne slås fra, og der skal vises en besked.
3. A17: Gå gennem en tunnel. Der skal være et hul i ruten, ingen opfundet distance og ingen bip, før tempoet er målt igen.
4. A19: Tving appen til at lukke under en tur, og åbn den igen. Gendannelse skal tilbydes, og hullet skal være markeret.
5. K52/K53: 6-timers tur med slukket skærm, batterimåling ved 60 minutter, og 5 km opmålt rute.
6. Dokumentér resultaterne i en lydkompatibilitetsmatrix og en enhedsmatrix (K27, K54).

## Beslutninger før udviklingsaftale

Understøttede telefoner og systemversioner, referenceenheder, bundle-id (nu `dk.teamingberg.runpace`), betalingsmodel og batterigrænse. Se kravspecifikationens sidste side.
