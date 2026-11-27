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
- Commit only when asked. Commits go on `main`; remote `origin` is github.com/henry0125xu/byear (public, GPL-3.0-or-later because Rubber Band is GPL). Push only when asked.

## Commands

```sh
npm install
npm run dev        # Vite dev server, http://localhost:5173
dev.cmd            # same, for double-clicking on Windows: installs deps if missing, opens the browser
npx tsc -p .       # typecheck (run after every change)
npm test           # vitest: chords + playback engine, ~7 s (also runs in the Pages workflow before deploy)
npm run build      # tsc + vite build → dist/
```

## Stack

- TypeScript + Vite, plain DOM (no framework). Svelte remains an option if the UI grows.
- `rubberband-wasm`: Rubber Band (GPL) time-stretch and pitch shift, real-time mode, driven synchronously from the audio callback. Default engine is R3 "HQ"; R2 is the lighter option.
- `soundtouchjs`: the fallback engine. There are no upstream types; see [src/soundtouch.d.ts](src/soundtouch.d.ts).
- `smplr`: soundfont samples (MusyngKite / FluidR3, from gleitz.github.io) and multi-sampled electric pianos (from smpldsnds.github.io), loaded on first use, then cached via CacheStorage.
- `tonal`: chord parsing and note math.
- `vite.config.ts` sets `base: "./"` so the build works under `/byear/` on GitHub Pages. [.github/workflows/pages.yml](.github/workflows/pages.yml) builds and deploys on every push to `main` (Settings → Pages → Source: GitHub Actions).

## Tests

Only pure logic is tested; sound quality and UI are judged by the user.

- [src/music/chords.test.ts](src/music/chords.test.ts): every symbol in Decision #4, slash and 6/9 handling, voicing shapes.
- [src/audio/engine.test.ts](src/audio/engine.test.ts): drives `PlaybackEngine` in 128-frame quanta with a click track, for all three engines: playhead vs. audible clicks, first-pass loop resync, pre-roll, end of file, engine switch. Tolerances come from measured values; if a change makes one fail, find out why before loosening it.
- `tsconfig.json` has `"types": []` so Node types stay out of app code; test files that need Node add `/// <reference types="node" />`.

## Layout

| File | Role |
|------|------|
| [src/main.ts](src/main.ts) | Creates `AudioContext`, `Player`, `Tones`; audio unlock; calls the `setup*()` UI modules and wires them together |
| [src/ui/transport.ts](src/ui/transport.ts) | `setupTransport`: waveform, play/stop, A/B loop, nudge, pre-roll (localStorage `byear.preRoll`), playhead render loop |
| [src/ui/controls.ts](src/ui/controls.ts) | `setupControls`: speed, transpose, fine-tune, engine, volumes, sound, strum, sustain |
| [src/ui/notePad.ts](src/ui/notePad.ts) | `setupNotePad`: note grid / piano view toggle, note playing, `flash` |
| [src/ui/chordPanel.ts](src/ui/chordPanel.ts) | `setupChordPanel`: chord entry form, chord buttons, voicing choice |
| [src/ui/shortcuts.ts](src/ui/shortcuts.ts) | `setupShortcuts`: all global keys (keydown/keyup), held chord keys `1`–`9` |
| [src/ui/fileInput.ts](src/ui/fileInput.ts) | `setupFileInput`: picker and drag-and-drop, decode |
| [src/ui/dom.ts](src/ui/dom.ts) | `$`, `fmt`, `releaseOnPointerUp` |
| [src/workspace/workspace.ts](src/workspace/workspace.ts) | Per-song `Workspace` format (versioned), `parseWorkspace` (validate, repair, defaults), storage key, export name. Pure, tested |
| [src/ui/workspacePanel.ts](src/ui/workspacePanel.ts) | `setupWorkspace`: restore on file open, debounced auto-save to localStorage `byear.ws.<name>|<length>`, Export / Import buttons |
| [src/ui/changes.ts](src/ui/changes.ts) | `workspaceChanged()` / `onWorkspaceChange()`: modules call it after a user change to per-song state |
| [src/audio/player.ts](src/audio/player.ts) | `Player` (main thread): posts commands to the worklet, mirrors loop/speed/playing, extrapolates `currentTime` from the worklet's position reports. Fetches the Rubber Band .wasm and sends the bytes over |
| [src/audio/player-worklet.ts](src/audio/player-worklet.ts) | AudioWorklet processor: runs `PlaybackEngine`, renders 128-frame quanta, reports `{pos, time}` every ~23 ms |
| [src/audio/engine.ts](src/audio/engine.ts) | `PlaybackEngine` and `LoopSource` (own read head, wraps at A/B): transport, loop, pre-roll, stretcher. No DOM/worklet APIs, so Node can drive it |
| [src/audio/protocol.ts](src/audio/protocol.ts) | Message types between `Player` and the worklet |
| [src/audio/stretch.ts](src/audio/stretch.ts) | `Stretcher` interface; `RubberBandStretcher` (R2 / R3 HQ) and `SoundTouchStretcher`. Engine choice in localStorage `byear.engine` |
| [src/audio/tones.ts](src/audio/tones.ts) | `Tones`: smplr instruments (`INSTRUMENTS`: piano, electric pianos via `ElectricPiano`, several guitar sounds) → `volume` gain (0–2) → limiter (`output`). Choice in localStorage `byear.instrument` |
| [src/music/chords.ts](src/music/chords.ts) | `parseChord`, `pianoVoicing`, `guitarVoicing` |
| [src/ui/waveform.ts](src/ui/waveform.ts) | Canvas waveform: click to seek, drag to make a loop, drag edges to adjust |
| [src/ui/noteGrid.ts](src/ui/noteGrid.ts) | Default low-key note picker (octave rows × 12 boxes, 4 octaves visible) |
| [src/ui/piano.ts](src/ui/piano.ts) | Optional 88-key piano view (toggle remembered in localStorage `byear.noteView`) |

## Things that are easy to get wrong

- **The read head runs ahead of the audio you hear.** The stretcher buffers source audio. `PlaybackEngine.heardTime` takes the frames handed out since the last seek (`LoopSource.fed`), subtracts `Stretcher.pending`, and maps the result back through `LoopSource.positionAt` (which records each loop wrap). The worklet reports that with the context time; `Player.currentTime` adds the elapsed time × speed minus `outputLatency`. Any logic about "where the user is" must use these, not `LoopSource.pos`.
- **Two copies of some state.** `Player` mirrors loop, speed, pre-roll and playing so the UI can read them synchronously; the worklet's `PlaybackEngine` is the source of truth for audio. Change both sides together. After a seek, `Player.setSnap` shows the target until the worklet reports.
- **Rubber Band alignment.** After every reset, `RubberBandStretcher.clear` feeds the preferred start pad of silence and discards the start delay, so output lines up with the seek point. `pending` is only right if that is kept.
- **CPU and the 2.9 ms quantum.** Rubber Band runs in the AudioWorklet, which must finish each 128-frame quantum in about 2.9 ms. Feeding it only what `samples_required` asks for, at most `FEED_CHUNK` (256) frames at a time, keeps the work even; feeding a 512-frame minimum caused 60–120 late quanta per 6 s with R3 at 50% (Node simulation), now 1–2. If the user hears crackles, suggest the lighter engine first.
- **Loop changes resync the buffer.** `PlaybackEngine.setLoop` and `setLoopOn` read `heardTime` *before* they change the loop (the estimate depends on the loop), then call `resyncToLoop`. Without that, the first pass plays past B. Keep this when touching loop code.
- **Test tones follow the recording's pitch offset.** `tones.detuneCents = player.pitchOffsetCents` (transpose and cents). Chord and note labels always stay in the original key (Decision #2).
- **Slash chords are split by hand** in `parseChord`, because tonal measures `G/B` intervals from the bass. `C6/9` is a chord type, not a slash chord.
- **Buttons are blurred after a click** so that Space doesn't trigger them again. Shortcuts are ignored while a text input or select has focus.
- **Notes sound while held.** `Tones.start` returns `HeldNotes`; mouse-up (`releaseOnPointerUp`) or key-up (`1`–`9`) calls `release()`. Quick clicks still last `MIN_HOLD`; with Sustain on, released notes ring for up to `SUSTAIN_MAX`. Only the chord preview after "Add" uses a fixed duration.
- **Pre-roll only applies to jumps to A** (Enter, Stop, play past B, nudging A, `seekToLoopStart`), never to loop wraps, so the loop itself doesn't change.
- **Per-song vs. global state.** Loop, speed, transpose, cents, chord buttons and tonic are per song (workspace). Sound, engine, volumes, strum, sustain, pre-roll and note view are global (their own localStorage keys). A new per-song field needs: a field + default + repair in `parseWorkspace` (bump `WORKSPACE_VERSION` only for breaking changes), a test, `collect`/`apply` in `workspacePanel.ts`, and a `workspaceChanged()` call where the user changes it. `apply*` methods must not call `workspaceChanged()`.
- **Opening a file with no saved workspace resets the per-song state to defaults** (chord buttons included, Decision #9). Import always applies to the currently open file (Decision #11).
- **Volume in practice.** The user found the tones too quiet at gain 1.0. The range is now 0–200% (default 120%) with velocity 110 and a limiter.

## Status (as of 2026-11-27)

The first commit is a playable prototype that covers most of v0.1.

Done:
- Import (picker and drag-and-drop), waveform, play / pause / stop / seek
- A/B loop: `[` `]` `L` `Enter`, drag to create, drag edges; first-pass resync fix; Shift+←/→ moves A, Ctrl+←/→ moves B (50 ms); pre-roll 0 / 0.5 / 1 / 2 s (localStorage `byear.preRoll`)
- Playback in an AudioWorklet (ScriptProcessor removed); Rubber Band HQ / lighter / SoundTouch engines
- Notes and chords sound while held, Sustain toggle
- Speed slider 25–125% with 100/75/50 presets; transpose ±12; fine-tune ±50¢
- Piano and guitar tones, strum toggle (on by default for guitar), separate volumes
- Chord buttons from symbols, keys `1`–`9`, guitar-style voicing
- Note grid (default) and piano view toggle (the user didn't want an obvious piano on a work screen)

User feedback (2026-11-27): SoundTouch at 50% sounded worse than YouTube → Rubber Band (Decision #6) "sounds much better". Loop seam and playhead were fine before the AudioWorklet move; recheck by ear after it.

- GitHub Pages deploy via Actions (2026-11-27)

v0.1 is complete once the first Pages deploy is confirmed.

Next: v0.2, planned 2026-11-27 (Decisions #12–15). Order: ~~split main.ts into modules~~ (done) → ~~workspace save~~ (done, awaiting user check) → tonic + drone → computer keyboard mode → hold mode → chord builder (structured, then manual). The user tries each step before it is committed.
