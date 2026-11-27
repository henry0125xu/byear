import { $ } from "./dom";

/** File picker and drag-and-drop anywhere on the page. */
export function setupFileInput(ctx: AudioContext, onLoaded: (buffer: AudioBuffer, file: File) => void): void {
  const name = $("file-name");

  async function open(file: File): Promise<void> {
    name.textContent = `Decoding ${file.name}…`;
    try {
      const buffer = await ctx.decodeAudioData(await file.arrayBuffer());
      name.textContent = file.name;
      onLoaded(buffer, file);
    } catch {
      name.textContent = `Could not decode ${file.name}`;
    }
  }

  $<HTMLInputElement>("file").addEventListener("change", (e) => {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (f) void open(f);
  });
  window.addEventListener("dragover", (e) => {
    e.preventDefault();
    document.body.classList.add("dragover");
  });
  window.addEventListener("dragleave", () => document.body.classList.remove("dragover"));
  window.addEventListener("drop", (e) => {
    e.preventDefault();
    document.body.classList.remove("dragover");
    const f = e.dataTransfer?.files?.[0];
    if (f) void open(f);
  });
}
