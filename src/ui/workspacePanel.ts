import {
  defaultWorkspace,
  exportFileName,
  parseWorkspaceJson,
  serializeWorkspace,
  workspaceKey,
  WORKSPACE_VERSION,
  type Workspace,
} from "../workspace/workspace";
import { onWorkspaceChange } from "./changes";
import type { ChordPanel } from "./chordPanel";
import type { Controls } from "./controls";
import { $ } from "./dom";
import type { Transport } from "./transport";

export interface WorkspacePanel {
  /** A new audio file was loaded: restore its saved workspace, or start from defaults. */
  open(fileName: string, duration: number, loop: () => { a: number; b: number; on: boolean }): void;
}

const SAVE_DELAY_MS = 400;

/** Auto-save per audio file, plus JSON export / import (header buttons). */
export function setupWorkspace(transport: Transport, controls: Controls, chords: ChordPanel): WorkspacePanel {
  const status = $("ws-status");
  let current: { key: string; name: string; duration: number; loop: () => { a: number; b: number; on: boolean } } | null =
    null;
  let saveTimer = 0;

  function say(text: string): void {
    status.textContent = text;
  }

  function collect(): Workspace | null {
    if (!current) return null;
    return {
      version: WORKSPACE_VERSION,
      file: { name: current.name, duration: current.duration },
      loop: current.loop(),
      ...controls.song(),
      chords: chords.entries(),
    };
  }

  function apply(ws: Workspace): void {
    transport.applyLoop(ws.loop);
    controls.applySong(ws);
    chords.applyEntries(ws.chords);
  }

  function save(): void {
    const ws = collect();
    if (!ws || !current) return;
    try {
      localStorage.setItem(current.key, serializeWorkspace(ws));
      say("Saved");
    } catch {
      say("Could not save (storage full?)");
    }
  }

  onWorkspaceChange(() => {
    if (!current) return;
    clearTimeout(saveTimer);
    saveTimer = window.setTimeout(save, SAVE_DELAY_MS);
  });

  // ---- export / import ----
  $("ws-export").addEventListener("click", () => {
    const ws = collect();
    if (!ws) return say("Open an audio file first");
    const url = URL.createObjectURL(new Blob([serializeWorkspace(ws)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = exportFileName(ws.file.name);
    a.click();
    URL.revokeObjectURL(url);
  });

  $("ws-reset").addEventListener("click", () => {
    if (!current) return say("Open an audio file first");
    if (!confirm("Reset this song's loop, speed, pitch, chords and tonic?")) return;
    clearTimeout(saveTimer);
    apply(defaultWorkspace(current.name, current.duration));
    save();
    say("Reset");
  });

  const importInput = $<HTMLInputElement>("ws-import-file");
  $("ws-import").addEventListener("click", () => {
    if (!current) return say("Open the audio file first, then import");
    importInput.click();
  });
  importInput.addEventListener("change", async () => {
    const file = importInput.files?.[0];
    importInput.value = "";
    if (!file || !current) return;
    const r = parseWorkspaceJson(await file.text());
    if (!r.ok) return say(`Import failed: ${r.error}`);
    apply(r.workspace);
    save();
    const from = r.workspace.file.name;
    say(from && from !== current.name ? `Imported (made for ${from})` : "Imported");
  });

  return {
    open(name, duration, loop) {
      clearTimeout(saveTimer);
      const key = workspaceKey(name, duration);
      current = { key, name, duration, loop };
      const stored = localStorage.getItem(key);
      const r = stored ? parseWorkspaceJson(stored) : null;
      if (r?.ok) {
        // The stored length is rounded in the key; keep the real one.
        apply({ ...r.workspace, file: { name, duration } });
        say("Restored");
      } else {
        apply(defaultWorkspace(name, duration));
        say("");
      }
    },
  };
}
