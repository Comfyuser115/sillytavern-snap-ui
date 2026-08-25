// Chat-scoped persistence for snap-view. Snaps live inside SillyTavern's
// existing chat_metadata object so they're saved/loaded with the chat file
// automatically, no separate DB needed.
import { chat_metadata } from "../../../../../script.js";
import { saveMetadataDebounced } from "../../../../extensions.js";

const STORAGE_KEY = "snap_view";
const MAX_SNAPS_PER_CHARACTER = 50;

function getDefaultState() {
  return { snaps: [], personas: {}, lastSnapAt: {} };
}

// chat_metadata is reassigned wholesale by ST on chat switch, so always
// re-read it here rather than caching the returned state object long-term.
export function loadSnapState() {
  if (!chat_metadata[STORAGE_KEY]) {
    chat_metadata[STORAGE_KEY] = getDefaultState();
  }
  return chat_metadata[STORAGE_KEY];
}

export function saveSnapState() {
  saveMetadataDebounced();
}

function pruneSnaps(state, characterId) {
  const forCharacter = state.snaps
    .filter((s) => s.characterId === characterId)
    .sort((a, b) => a.createdAt - b.createdAt);

  const excess = forCharacter.length - MAX_SNAPS_PER_CHARACTER;
  if (excess <= 0) return;

  const dropIds = new Set(forCharacter.slice(0, excess).map((s) => s.id));
  state.snaps = state.snaps.filter((s) => !dropIds.has(s.id));
}

export function addSnap(state, snap) {
  state.snaps.push(snap);
  pruneSnaps(state, snap.characterId);
  state.lastSnapAt[snap.characterId] = snap.createdAt;
  saveSnapState();
  return snap;
}

export function getSnapsForCharacter(state, characterId) {
  return state.snaps.filter((s) => s.characterId === characterId);
}

export function getUnviewedSnaps(state, characterId) {
  return getSnapsForCharacter(state, characterId).filter(
    (s) => s.viewedAt === null && !s.expired,
  );
}

export function markSnapViewed(state, snapId) {
  const snap = state.snaps.find((s) => s.id === snapId);
  if (!snap) return null;
  snap.viewedAt = Date.now();
  saveSnapState();
  return snap;
}

export function expireSnap(state, snapId) {
  const snap = state.snaps.find((s) => s.id === snapId);
  if (!snap) return null;
  snap.expired = true;
  saveSnapState();
  return snap;
}
