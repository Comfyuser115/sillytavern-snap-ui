// Lets the character "remember" recent snaps by injecting a compact
// rolling summary via setExtensionPrompt. Kept to the last few snaps so it
// doesn't bloat context — older ones are summarized out entirely rather
// than accumulated.
import {
  setExtensionPrompt,
  extension_prompt_types,
  extension_prompt_roles,
} from "../../../../../script.js";
import { getSnapsForCharacter } from "./storage.js";

const EXTENSION_PROMPT_KEY = "snap_view";
const MAX_SNAPS_IN_SUMMARY = 3;

function describeSnap(snap, characterName) {
  const who = snap.direction === "incoming" ? characterName : "The user";
  const status =
    snap.viewedAt === null
      ? "not yet opened"
      : snap.direction === "incoming"
        ? "opened by the user"
        : `opened by ${characterName}`;
  const minutesAgo = Math.max(0, Math.round((Date.now() - snap.createdAt) / 60000));
  return `${who} sent a snap ${minutesAgo} min ago described as "${snap.description}" (caption: "${snap.caption}") — ${status}.`;
}

// Recomputes and (re)sets the rolling snap summary for the given character.
// Call this after any snap is added/viewed/expired, and whenever the active
// character changes (to avoid leaking a stale character's summary).
export function updateSnapContext(state, characterId, characterName) {
  const snaps = getSnapsForCharacter(state, characterId)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, MAX_SNAPS_IN_SUMMARY)
    .reverse();

  if (snaps.length === 0) {
    setExtensionPrompt(EXTENSION_PROMPT_KEY, "", extension_prompt_types.IN_PROMPT, 0);
    return;
  }

  const summary = `[Snap context:\n${snaps.map((s) => describeSnap(s, characterName)).join("\n")}]`;
  setExtensionPrompt(
    EXTENSION_PROMPT_KEY,
    summary,
    extension_prompt_types.IN_PROMPT,
    0,
    false,
    extension_prompt_roles.SYSTEM,
  );
}

export function clearSnapContext() {
  setExtensionPrompt(EXTENSION_PROMPT_KEY, "", extension_prompt_types.IN_PROMPT, 0);
}
