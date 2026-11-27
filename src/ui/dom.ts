export const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

/** m:ss.s (or more digits). */
export function fmt(t: number, digits = 1): string {
  const m = Math.floor(t / 60);
  const s = (t - m * 60).toFixed(digits);
  return `${m}:${s.padStart(digits + 3, "0")}`;
}

/** Calls `held.release()` when the mouse button comes up anywhere. */
export function releaseOnPointerUp(held: { release(): void }): void {
  const up = () => {
    held.release();
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", up);
  };
  window.addEventListener("pointerup", up);
  window.addEventListener("pointercancel", up);
}
