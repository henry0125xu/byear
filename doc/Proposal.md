# ByEar

## A Personal Transcription Workspace That Trains Your Ear

> Transcribe by ear, and get a better ear while you do it.

---

# Summary

ByEar is a personal tool for transcribing songs by ear, built around my own guitar transcription and ear-training habits.

It is not a DAW, and it is not an auto-transcription tool. It gives me what I normally reach for an instrument or a DAW to do:

- Loop and slow down a passage
- Play test notes and chords against the recording
- Write down what I hear at the right point in the song
- Think about what I hear both as pitch (C, Am) and as function (Do, vi)

Its main use is short sessions at work, with headphones and no instrument.

The market and competing products are out of scope for now. If other people find it useful later, that is a bonus.

---

# Core Workflow

```text
Hear
→ Guess
→ Verify
→ Refine
→ Write it down
```

ByEar supports each step. It never skips the "Guess" step for me.

| Step | What ByEar provides |
|------|-----------------------|
| Hear | Playback, A/B loop, speed control, frequency focus |
| Guess | Test notes and chords, a tonic drone for reference |
| Verify | Play my guess over the looping recording and compare |
| Refine | Fine-tune the loop, slow it down, try other voicings |
| Write it down | Markers and chord or note annotations on the timeline |

Ear training happens as part of transcribing: every guess I verify is a repetition. Dedicated training modes may come later (see [Future Ideas](#future-ideas)).

---

# Platform

**A local web app that runs in the browser.**

Reasons:

- Nothing to install, so it works on a locked-down work computer
- The Web Audio API covers playback, looping, EQ and synthesized or sampled tones
- It is easy to iterate on and easy to move to a PWA or desktop wrapper (e.g., Tauri) later

Audio source: local files only (MP3, WAV, and whatever else the browser can decode, such as M4A or FLAC). Streaming and YouTube are out of scope.

Key technical pieces:

| Need | Approach |
|------|----------|
| Waveform display | Decode with Web Audio and draw on canvas (or wavesurfer.js) |
| Speed change without pitch change | Time-stretch engine (SoundTouch or Rubber Band, compiled to WASM) |
| Pitch shift and fine-tune (cents) | The same time-stretch engine |
| Test tones | Sampled instruments (piano and guitar), e.g., via a soundfont |
| Frequency focus | Web Audio `BiquadFilterNode` |
| Persistence | IndexedDB / localStorage, plus JSON export and import |

---

# Design Principles

## Fast Access

Open the app, drop in a file, and start looping within seconds. There are no projects to create first.

## Keyboard-First

Every core action has a shortcut, so transcribing never means hunting for a button.

## Assist Hearing, Never Replace It

There is no automatic chord or note detection. ByEar verifies my guesses. It does not hand me answers.

## Data Independent of Display

Musical data (pitches, chords, tonic) is stored once. Display systems (note names, solfege, Roman numerals) are views of that data.

---

# Features

## 1. Audio Player

- Import a local audio file (drag and drop or file picker)
- Waveform display with a playhead
- Play, pause, stop and seek (click on the waveform)

## 2. A/B Loop

- Set A and B **while playing** with shortcuts (e.g., `[` and `]`)
- Drag the loop edges on the waveform
- Nudge the loop edges in small steps with shortcuts
- Toggle the loop on and off
- Optional pre-roll: start a little before A

## 3. Speed Control

- Continuous slider (e.g., 25% to 125%)
- Quick presets: 100 / 75 / 50%
- Pitch stays the same (time-stretch)

Note: quality drops noticeably below about 50%. This is expected.

## 4. Pitch Control

- **Transpose** in semitones (±12)
- **Fine-tune** in cents (±50), for detuned recordings, older tape recordings and songs in Eb tuning

## 5. Test Tones

### Note Keyboard

- On-screen piano, A0 to C8
- Click to play
- Highlights the key I am playing (this is not pitch detection from the recording)

### Computer Keyboard Mode

- Map computer keys to notes (a piano-style layout on two rows)
- Shift octaves with shortcuts
- The mapping can be configured

### Instrument Sounds

- Piano
- Acoustic guitar
- (Later: electric guitar, bass)

### Mix Balance

- Separate volume controls for the recording and for the test tones

## 6. Chord Buttons

- A grid of reusable chord buttons for the current song
- Click a button (or press a shortcut) to play the chord
- **Strum or block playback** (strum suits guitar sounds)
- **Sustain or hold mode**: the chord rings while the loop plays

### Chord Entry

- **Formula parsing** (v0.1): type `Cm7`, `F#maj7`, `Bbadd9`, `Bm7b5`, `AmMaj7`, `G/B`
- **Manual construction** (v0.2): pick individual notes
- **Structured builder** (v0.2): root, quality, extensions, inversion and octave, set with UI controls

## 7. Timeline Annotations

This is what makes ByEar a notebook rather than just a player.

- **Markers**: label sections (Intro, Verse, Chorus…)
- **Chord annotations**: pin a chord to a time position, chosen from the chord buttons or typed in
- **Text notes**: free-form comments at a time position
- Click an annotation to jump there, or loop that section

## 8. Tonic Drone

- A sustained tonic (optionally with its fifth) under the recording
- Gives a constant reference for hearing scale degrees and function
- Uses its own volume control

## 9. Frequency Focus

- Presets: Bass / Mid / Treble focus
- Optional: a band-pass filter with a variable center

## 10. Workspace Save

- Auto-save per audio file (the file is matched by name and length)
- Saves: loops, speed and pitch settings, chord buttons, annotations and tonic
- Export and import as JSON

The audio itself is not stored. You select the file again on load.

---

# Tonal Modes

Goal: switch between hearing in absolute pitch (C, Am) and hearing in function relative to a tonic (Do, vi), on the same song.

The first version keeps this deliberately simple: **two modes, and one input (the tonic)**.

## The Tonic

- Each song has one **tonic**, set by me (e.g., `A`)
- There is **no major/minor/mode setting**. Everything is measured in semitones from the tonic.
- The tonic drone uses the same tonic
- If a song modulates, I change the tonic by hand. Per-section tonics may come later, together with timeline annotations.

## Fixed Mode

Absolute pitch. The tonic is ignored for display.

- Notes: `C D E F G A B`, or fixed-do syllables `Do Re Mi…` (C = Do), as a display option
- Chords: shown as typed, e.g. `Am7`, `G/B`

## Movable Mode (Tonic-Relative)

Every note and chord root is labelled by its distance from the tonic, using one fixed chromatic table:

| Semitones from tonic | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Solfege | Do | Ra | Re | Me | Mi | Fa | Fi | Sol | Le | La | Te | Ti |
| Roman root | I | bII | II | bIII | III | IV | #IV | V | bVI | VI | bVII | VII |

Roman numeral rules:

- Case comes from the chord quality: major or augmented → upper case, minor or diminished → lower case
- Suffix: `°` for diminished, `ø` for m7b5, `+` for augmented, plus extensions as typed (`7`, `maj7`, `add9`…)
- Slash chords: the bass is shown as solfege, e.g. `G/B` with tonic C → `V/Ti` (no figured-bass or inversion numbers)
- Option: show the absolute name alongside, e.g. `vi7 (Am7)`

Examples:

```text
Tonic C:  C   Am   F    G     →  I    vi   IV    V
Tonic A:  Am  F    C    G     →  i    bVI  bIII  bVII
Tonic D:  D   C    G    D     →  I    bVII IV    I      (Mixolydian)
Tonic C:  Am  F    C    G     →  vi   IV   I     V      (same song, la-based reading)
```

## How the Open Questions Are Resolved

| Question | Simple answer for now |
|----------|-----------------------|
| Where the key comes from | One tonic per song, set by hand |
| Minor: la-based or do-based | Do-based (the tonic is always Do / I). For la-based, set the tonic to the relative major. |
| Borrowed chords, chromatic notes | Covered by the chromatic table (bVII, iv, Te, Le…) |
| Secondary dominants | Shown literally (`II7`, not `V/V`). Interpreting function is my job, not the app's. |
| Modes (Dorian, Mixolydian…) | Covered by the table, no mode setting needed |
| Enharmonic spelling | Movable mode: fixed table. Fixed mode: chords keep the spelling I typed; single notes follow a ♯/♭ toggle. |
| Fixed Do | A display option in Fixed mode (C = Do), not its own mode |

Known simplifications: no per-section keys, and `#IV` is always written as `#IV`, never as `bV`.

Intentionally not planned: secondary-dominant notation (`V/V`), figured bass and other functional interpretation. The app labels intervals from the tonic, and I decide what they mean.

---

# Data Model (Draft)

Principles:

- Pitches keep both **spelling** and **octave**
- Roman numerals and solfege are **derived** from the pitches and the tonic. They are never stored.

```json
{
  "id": "chord-1",
  "symbol": "Am7",
  "root": "A",
  "quality": "m7",
  "bass": null,
  "voicing": ["A3", "E4", "G4", "C5"]
}
```

```json
{
  "tonic": "C",
  "displayMode": "movable",
  "showAbsolute": true
}
```

```json
{
  "annotations": [
    { "time": 12.35, "type": "chord", "chordId": "chord-1" },
    { "time": 0.0, "type": "marker", "label": "Intro" },
    { "time": 30.1, "type": "note", "text": "bass walks down here" }
  ]
}
```

Display at 12.35s, with tonic C:

```text
Fixed:            Am7
Movable:          vi7
Movable + names:  vi7 (Am7)
```

Derivation: `(root pitch class − tonic pitch class) mod 12` → the table in [Tonal Modes](#tonal-modes), with the case and suffix taken from `quality`.

---

# Decisions

All of the questions below were decided on 2026-11-27. Items marked ★ affect v0.1.

| # | Question | Decision |
|---|----------|----------------|
| 1 ★ | **Hosting**: how does a "local web app" run on a locked-down work computer? `file://` breaks WASM and ES modules, and I may not be able to run a local server. | A static site on GitHub Pages. Audio files are only read in the browser and never uploaded. |
| 2 ★ | **Transpose semantics**: after transposing the audio, do test tones and labels follow? | Labels always use the **original key**. Test tones and the drone follow the transpose and the cents offset, so `D` still matches the recording after transposing −2. |
| 3 ★ | **Default chord voicing**: what does `Am7` actually play? | Close position, root around octave 3. With the guitar sound, use a guitar-like spread voicing. The voicing can be edited in the builder (v0.2). |
| 4 ★ | **Chord parser scope**: which symbols are supported? | Triads, `sus2/sus4`, `5`, `6`, `6/9`, `7`, `maj7`, `m7`, `m7b5`, `dim7`, `mMaj7`, `9/11/13`, `add9/add11`, altered tensions (`b9`, `#9`, `#11`, `b13`), slash chords. Anything else shows an error. |
| 5 ★ | **Tech stack** | TypeScript + Vite, plus a light UI layer (Svelte or plain DOM). |
| 6 ★ | **Time-stretch engine**: SoundTouch or Rubber Band? | Build a quick prototype with SoundTouch (simpler, LGPL). Switch to Rubber Band only if the quality at 50% is not good enough. |
| 7 | **Sample source** for piano and guitar | A free soundfont (e.g., from the FluidR3 / MusyngKite sets), loaded once and cached |
| 8 | **Shortcut conflicts**: computer keyboard mode uses letter keys, which clash with global shortcuts | A toggle key (e.g., `Tab`) switches between "play mode" and "command mode". Transport keys (Space, `[`, `]`) work in both. |
| 9 | **Chord buttons**: one set per song, or a global library? | Per song, with "copy from another song" later |
| 10 | **Chord annotation length**: does a chord need an end time? | No. It lasts until the next chord annotation. |
| 11 | **Workspace matching**: renaming the file loses its saved workspace | Acceptable. Importing the JSON restores it. |
| 12 | **Computer keyboard layout** (decided 2026-11-27, for v0.2) | DAW style, one octave: `A S D F G H J K L ;` are white keys from C, `W E T Y U O P` are black keys, `Z` / `X` shift the octave. |
| 13 | **Hold mode** (v0.2): samples decay, so how does a chord "ring while the loop plays"? | Click a chord to latch it. It is struck again every time the loop returns to A, in time with the recording. Click it again (or another chord) to change or release. Uses the current sound. |
| 14 | **Configurable key mapping** | Not in v0.2. The mapping lives in one data table so it can be opened up later. |
| 15 | **Chord builder scope** (v0.2) | Both: structured first (root, quality, extensions, inversion, octave), then manual (pick notes). Chord buttons store a symbol plus an optional custom voicing. |

---

# Roadmap

## v0.1: Core Loop (usable for real transcription)

- Import audio, waveform display, play / pause / seek
- A/B loop with shortcuts and drag handles
- Speed slider (pitch preserved)
- Transpose and cents fine-tune
- On-screen piano with piano and guitar sounds
- Chord buttons with formula parsing, strum or block playback
- Mix balance between the recording and the test tones

## v0.2: Practice Tools

- Computer keyboard mode
- Chord builder (manual and structured)
- Sustain or hold mode for chords
- Tonic setting and tonic drone
- Workspace save: loops, settings, chord buttons, tonic (auto-save plus JSON export)

## v0.3: Notebook

- Timeline markers, chord annotations and text notes
- Click an annotation to jump there, or loop that section
- Workspace save extended to annotations

## v0.4: Function

- Fixed and Movable modes (see [Tonal Modes](#tonal-modes))
- Solfege and Roman numeral display, with optional absolute names alongside
- Frequency focus

## Later

- Guitar fretboard view (click a fret to play, show chord shapes)
- Per-section tonics (tonic-change markers on the timeline)
- Scale library and progression library
- More instrument sounds
- PWA or desktop wrapper

---

# Future Ideas

Ways to train the ear more directly, using my own transcriptions:

- **Blind mode**: hide chord or note labels and guess before revealing them
- **Quiz from my annotations**: play a looped section I have already transcribed and ask which chord or scale degree it is
- **Interval or degree check**: play a note, I say which degree it is relative to the drone, then the answer is revealed

---

# Non-Goals

- Multitrack recording, audio editing, MIDI editing
- Mixers, VST hosting, mastering
- Automatic chord or note detection
- Automatic harmonic analysis (secondary dominants, figured bass, key detection)
- Streaming or YouTube integration
- Market positioning and competitive features (for now)

---

# Success Criteria (Personal)

- I open ByEar instead of a DAW or my guitar to verify a guess
- From opening the file to the first loop takes under 10 seconds
- I finish a song's chord chart entirely inside ByEar
- I notice I am hearing functions (vi, IV) and not only note names
