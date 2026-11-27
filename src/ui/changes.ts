// Tells the workspace autosave that per-song state changed (loop, speed, pitch, chords, tonic).
const listeners = new Set<() => void>();

export function onWorkspaceChange(fn: () => void): void {
  listeners.add(fn);
}

export function workspaceChanged(): void {
  for (const fn of listeners) fn();
}
