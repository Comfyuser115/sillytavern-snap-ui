// Derives a character's snap persona from their matching lorebook entry
// rather than extension-local settings, matching how this ST instance is
// actually set up: each character has a corresponding lorebook entry, keyed
// by first name (no two characters share a first name here, so first-name
// matching is sufficient and avoids "Laura Smith" vs "Laura" mismatches).
import { getSortedEntries } from "../../../../world-info.js";

function getFirstName(fullName) {
  return (fullName || "").trim().split(/\s+/)[0] || "";
}

function entryMatchesFirstName(entry, firstNameLower) {
  const keys = [...(entry.key || []), ...(entry.keysecondary || [])].map((k) =>
    String(k).trim().toLowerCase(),
  );
  if (keys.includes(firstNameLower)) return true;

  const commentFirstWord = (entry.comment || "").trim().split(/\s+/)[0]?.toLowerCase();
  return commentFirstWord === firstNameLower;
}

// Returns a SnapPersona-shaped object sourced from the lorebook entry whose
// key (or comment) matches the character's first name, or null if no entry
// matches.
export async function getPersonaFromLorebook(characterName) {
  const firstName = getFirstName(characterName);
  if (!firstName) return null;
  const firstNameLower = firstName.toLowerCase();

  const entries = await getSortedEntries();
  const match = entries.find((e) => !e.disable && entryMatchesFirstName(e, firstNameLower));
  if (!match) return null;

  return {
    characterId: undefined, // filled in by caller
    postingFrequency: "medium",
    contentStyle: match.content || "",
    captionTone: "",
    autoSend: false,
    sourceEntryUid: match.uid,
    sourceWorld: match.world,
  };
}

// Lorebook entry wins when present (that's the real source of truth for
// this setup); fallbackPersona (extension-local settings) is used only for
// characters with no matching lorebook entry.
export async function resolvePersona(characterId, characterName, fallbackPersona) {
  const lorePersona = await getPersonaFromLorebook(characterName);
  if (lorePersona) {
    return { ...lorePersona, characterId };
  }
  return fallbackPersona || { characterId };
}
