import { loadSnapState, addSnap } from "./lib/storage.js";
import { requestSnap } from "./lib/generation.js";
import { getContext } from "../../../extensions.js";
import { this_chid, characters, getCurrentChatId } from "../../../../script.js";

function getRecentContextText(limit = 6) {
  const context = getContext();
  const chat = context.chat || [];
  return chat
    .slice(-limit)
    .map((m) => `${m.name}: ${m.mes}`)
    .join("\n");
}

// Phase 1 has no UI yet. Drives the generation pipeline manually so it can
// be verified against a live ST instance: run `SnapView.testGenerateSnap()`
// in the browser console with a character chat open.
async function testGenerateSnap(direction = "incoming") {
  if (this_chid === undefined) {
    console.warn("[snap-view] No character selected — open a character chat first.");
    return null;
  }

  const character = characters[this_chid];
  const characterId = character.avatar;
  const chatId = getCurrentChatId();
  const state = loadSnapState();
  const persona = state.personas[characterId] || {};

  console.log("[snap-view] requesting snap for", character.name);
  const snap = await requestSnap({
    characterId,
    characterName: character.name,
    chatId,
    direction,
    persona,
    recentContext: getRecentContextText(),
  });

  addSnap(state, snap);
  console.log("[snap-view] snap stored:", snap);
  return snap;
}

jQuery(() => {
  console.log(
    "[snap-view] Phase 0/1 scaffold loaded. Run `SnapView.testGenerateSnap()` in the console to test the generation pipeline.",
  );
  window.SnapView = { testGenerateSnap, loadSnapState };
});
