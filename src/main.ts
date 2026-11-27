// Creates the audio objects and wires the UI modules together.
import "./style.css";
import { Drone } from "./audio/drone";
import { Player } from "./audio/player";
import { Tones } from "./audio/tones";
import { setupBuilder } from "./ui/builderPanel";
import { setupChordPanel } from "./ui/chordPanel";
import { setupControls } from "./ui/controls";
import { setupFileInput } from "./ui/fileInput";
import { setupNotePad } from "./ui/notePad";
import { setupShortcuts } from "./ui/shortcuts";
import { setupTransport } from "./ui/transport";
import { setupWorkspace } from "./ui/workspacePanel";

const ctx = new AudioContext();
const player = new Player(ctx);
const tones = new Tones(ctx);
const drone = new Drone(ctx);
player.output.connect(ctx.destination);
tones.output.connect(ctx.destination);
drone.output.connect(ctx.destination);

// Browsers start audio suspended; the first click or key resumes it and preloads samples.
let unlocked = false;
function unlock(): void {
  if (ctx.state !== "running") void ctx.resume();
  if (unlocked) return;
  unlocked = true;
  controls.loadInstrument();
}
window.addEventListener("pointerdown", unlock, { capture: true });
window.addEventListener("keydown", unlock, { capture: true });

const transport = setupTransport(player);
const controls = setupControls(ctx, player, tones, drone, () => unlocked);
const pad = setupNotePad(tones);
const chords = setupChordPanel(ctx, player, tones, pad, () => controls.strum);
setupBuilder(chords, pad);
const workspace = setupWorkspace(transport, controls, chords);
setupShortcuts(transport, chords, pad);
setupFileInput(ctx, (buffer, file) => {
  player.load(buffer);
  transport.setBuffer(buffer);
  workspace.open(file.name, buffer.duration, () => player.loop);
});
