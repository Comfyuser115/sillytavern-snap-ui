import { loadSnapState, addSnap } from "./lib/storage.js";
import { requestSnap } from "./lib/generation.js";
import { resolvePersona } from "./lib/snapPersona.js";
import { updateSnapContext, clearSnapContext } from "./lib/contextInjection.js";
import { mountSnapOverlay } from "./ui/chatThread.js";
import { getContext } from "../../../st-context.js";
import { this_chid, characters, getCurrentChatId } from "../../../../script.js";
import { eventSource, event_types } from "../../../events.js";

function getRecentContextText(limit = 6) {
  const context = getContext();
  const chat = context.chat || [];
  return chat
    .slice(-limit)
    .map((m) => `${m.name}: ${m.mes}`)
    .join("\n");
}

function refreshContextForActiveCharacter() {
  if (this_chid === undefined) {
    clearSnapContext();
    return;
  }
  const character = characters[this_chid];
  const state = loadSnapState();
  updateSnapContext(state, character.avatar, character.name);
}

// Manual test hook for the generation pipeline: run
// `SnapView.testGenerateSnap()` in the browser console with a character
// chat open.
async function testGenerateSnap(direction = "incoming") {
  if (this_chid === undefined) {
    console.warn("[snap-view] No character selected — open a character chat first.");
    return null;
  }

  const character = characters[this_chid];
  const characterId = character.avatar;
  const chatId = getCurrentChatId();
  const state = loadSnapState();
  const persona = await resolvePersona(characterId, character.name, state.personas[characterId]);

  console.log("[snap-view] requesting snap for", character.name, "using persona:", persona);
  const snap = await requestSnap({
    characterId,
    characterName: character.name,
    chatId,
    direction,
    persona,
    recentContext: getRecentContextText(),
  });

  addSnap(state, snap);
  updateSnapContext(state, characterId, character.name);
  console.log("[snap-view] snap stored:", snap);
  return snap;
}

jQuery(() => {
  mountSnapOverlay();
  refreshContextForActiveCharacter();
  eventSource.on(event_types.CHAT_CHANGED, refreshContextForActiveCharacter);
  console.log(
    "[snap-view] Loaded. Click the camera bubble (bottom-right) to open the snap panel, or run `SnapView.testGenerateSnap()` in the console.",
  );
  window.SnapView = { testGenerateSnap, loadSnapState };
});
