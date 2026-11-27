# ByEar

A personal web app for transcribing songs by ear (guitar-oriented) while training the ear. It is for the owner's own use first, mostly at work with headphones and no instrument. The market and competitors are explicitly out of scope.

**Read [doc/Proposal.md](doc/Proposal.md) first.** It holds the product scope, tonal-mode design, the Decisions table and the roadmap (v0.1 → v0.4). Don't re-open decisions recorded there unless the user asks.

## Background

- The user plays guitar and often transcribes songs (扒譜) and trains their ear during idle time at work: headphones on, no instrument, a work screen others can see. Keep the UI low-key; this is why the note grid is the default and the piano is optional.
- The app grew out of the user's own transcription routine: hear → guess → verify against the recording → refine → write it down.
- Simple first versions are preferred. Open-ended theory interpretation (secondary dominants, figured bass, key detection) is left to the user's judgment, not the app.
- The folder was originally named `eardesk` (the old project name). Earlier session history may sit under that path.

## Working with the user

- The user writes in Traditional Chinese (Taiwan). Reply in Traditional Chinese.
- Code, comments, UI text and `doc/` are in English.
- The user plays guitar and transcribes regularly. Domain terms (movable do, voicing, slash chords) need no explanation.
- Commit only when asked. Commits go on `master` (no remote yet).

## Commands

```sh
npm install
npm run dev        # Vite dev server, http://localhost:5173
dev.cmd            # same, for double-clicking on Windows: installs deps if missing, opens the browser
npx tsc -p .       # typecheck (run after every change; there are no tests yet)
npm run build      # tsc + vite build → dist/
```

## Stack

- TypeScript + Vite, plain DOM (no framework). Svelte remains an option if the UI grows.
- `rubberband-wasm`: Rubber Band (GPL) time-stretch and pitch shift, real-time mode, driven synchronously from the audio callback. Default engine is R3 "HQ"; R2 is the lighter option.
- `soundtouchjs`: the fallback engine. There are no upstream types; see [src/soundtouch.d.ts](src/soundtouch.d.ts).
- `smplr`: soundfont samples (MusyngKite / FluidR3, from gleitz.github.io) and multi-sampled electric pianos (from smpldsnds.github.io), loaded on first use, then cached via CacheStorage.
- `tonal`: chord parsing and note math.
- `vite.config.ts` sets `base: "./"` so the build can be served from GitHub Pages (decided hosting; not set up yet).

## Layout

| File | Role |
|------|------|
| [src/main.ts](src/main.ts) | Wires everything: file loading, transport, sliders, chord buttons, shortcuts, render loop |
| [src/audio/player.ts](src/audio/player.ts) | `Player`: `LoopSource` (own read head, wraps at A/B) → `Stretcher` → ScriptProcessor → `output` gain |
| [src/audio/stretch.ts](src/audio/stretch.ts) | `Stretcher` interface; `RubberBandStretcher` (R2 / R3 HQ) and `SoundTouchStretcher`. Engine choice in localStorage `byear.engine` |
| [src/audio/tones.ts](src/audio/tones.ts) | `Tones`: smplr instruments (`INSTRUMENTS`: piano, electric pianos via `ElectricPiano`, several guitar sounds) → `volume` gain (0–2) → limiter (`output`). Choice in localStorage `byear.instrument` |
| [src/music/chords.ts](src/music/chords.ts) | `parseChord`, `pianoVoicing`, `guitarVoicing` |
| [src/ui/waveform.ts](src/ui/waveform.ts) | Canvas waveform: click to seek, drag to make a loop, drag edges to adjust |
| [src/ui/noteGrid.ts](src/ui/noteGrid.ts) | Default low-key note picker (octave rows × 12 boxes, 4 octaves visible) |
| [src/ui/piano.ts](src/ui/piano.ts) | Optional 88-key piano view (toggle remembered in localStorage `byear.noteView`) |

## Things that are easy to get wrong

- **The read head runs ahead of the audio you hear.** The stretcher buffers source audio. `Player.currentTime` takes the frames handed out since the last seek (`LoopSource.fed`), subtracts `Stretcher.pending` and the output block, and maps the result back through `LoopSource.positionAt` (which records each loop wrap). Any logic about "where the user is" must use `currentTime`, not `LoopSource.pos`.
- **Rubber Band alignment.** After every reset, `RubberBandStretcher.clear` feeds the preferred start pad of silence and discards the start delay, so output lines up with the seek point. `pending` is only right if that is kept.
- **CPU.** Rubber Band runs on the main thread inside the ScriptProcessor callback (block = 4096 frames ≈ 93 ms). In Node, R3 HQ used about 25% of a core with a worst block of about 50–70 ms at 50% speed; R2 about 10%. If the user hears crackles, suggest the lighter engine, and treat it as a reason to move to an AudioWorklet.
- **Loop changes resync the buffer.** `setLoop` and `setLoopOn` read `currentTime` *before* they change the loop (the estimate depends on the loop), then call `resyncToLoop`. Without that, the first pass plays past B. Keep this when touching loop code.
- **Test tones follow the recording's pitch offset.** `tones.detuneCents = player.pitchOffsetCents` (transpose and cents). Chord and note labels always stay in the original key (Decision #2).
- **Slash chords are split by hand** in `parseChord`, because tonal measures `G/B` intervals from the bass. `C6/9` is a chord type, not a slash chord.
- **Buttons are blurred after a click** so that Space doesn't trigger them again. Shortcuts are ignored while a text input or select has focus.
- **Volume in practice.** The user found the tones too quiet at gain 1.0. The range is now 0–200% (default 120%) with velocity 110 and a limiter.

## Status (as of 2026-11-27)

The first commit is a playable prototype that covers most of v0.1.

Done:
- Import (picker and drag-and-drop), waveform, play / pause / stop / seek
- A/B loop: `[` `]` `L` `Enter`, drag to create, drag edges; first-pass resync fix
- Speed slider 25–125% with 100/75/50 presets; transpose ±12; fine-tune ±50¢
- Piano and guitar tones, strum toggle (on by default for guitar), separate volumes
- Chord buttons from symbols, keys `1`–`9`, guitar-style voicing
- Note grid (default) and piano view toggle (the user didn't want an obvious piano on a work screen)

Remaining for v0.1:
- Nudge loop edges with shortcuts; optional pre-roll before A
- User judged (2026-11-27): SoundTouch at 50% sounded worse than YouTube → switched to Rubber Band (Decision #6), user still to confirm by ear. Guitar samples "OK" → more guitar sounds added to try. Loop seam and playhead: fine.
- Tech debt: ScriptProcessorNode is deprecated → move to AudioWorklet once the prototype is accepted
- GitHub Pages deploy (needs a remote repo from the user)

Next after that: v0.2 (computer keyboard mode, chord builder, hold mode, tonic and drone, workspace save). See the roadmap in the proposal.
