// Global (cross-chat) persistence for snap-view, since contacts are drawn
// from a lorebook rather than tied to whichever ST chat happens to be
// open. Lives in extension_settings so it's available everywhere, not
// scoped to a single chat file.
import { extension_settings } from "../../../../extensions.js";
import { saveSettingsDebounced } from "../../../../../script.js";

const MODULE_NAME = "snap_view";
const MAX_ITEMS_PER_CONTACT = 50;

function getDefaultState() {
  return { selectedWorld: null, contacts: [], items: [], lastActivityAt: {}, lastAmbientAt: {} };
}

export function loadSnapState() {
  if (!extension_settings[MODULE_NAME]) {
    extension_settings[MODULE_NAME] = getDefaultState();
  }
  // migration: backfill saved flag for snaps created before this feature
  for (const item of extension_settings[MODULE_NAME].items || []) {
    if (item.kind === "snap" && item.saved === undefined) item.saved = false;
    if (item.expired === undefined) item.expired = false;
  }
  if (!extension_settings[MODULE_NAME].lastAmbientAt) extension_settings[MODULE_NAME].lastAmbientAt = {};
  return extension_settings[MODULE_NAME];
}

export function saveSnapState() {
  saveSettingsDebounced();
}

export function setSelectedWorld(state, worldName) {
  state.selectedWorld = worldName || null;
  saveSnapState();
}

// contacts: [{ uid, name }]
export function setContacts(state, contacts) {
  state.contacts = contacts;
  saveSnapState();
}

function pruneItems(state, contactKey) {
  const forContact = state.items
    .filter((i) => i.contactKey === contactKey)
    .sort((a, b) => a.createdAt - b.createdAt);

  const excess = forContact.length - MAX_ITEMS_PER_CONTACT;
  if (excess <= 0) return;

  const dropIds = new Set(forContact.slice(0, excess).map((i) => i.id));
  state.items = state.items.filter((i) => !dropIds.has(i.id));
}

export function addItem(state, item) {
  state.items.push(item);
  pruneItems(state, item.contactKey);
  state.lastActivityAt[item.contactKey] = item.createdAt;
  saveSnapState();
  return item;
}

export function getItemsForContact(state, contactKey) {
  return state.items.filter((i) => i.contactKey === contactKey);
}

export function getLastItemForContact(state, contactKey) {
  const items = getItemsForContact(state, contactKey).sort((a, b) => b.createdAt - a.createdAt);
  return items[0] || null;
}

export function hasUnreadForContact(state, contactKey) {
  return getItemsForContact(state, contactKey).some(
    (i) => i.direction === "incoming" && i.viewedAt === null,
  );
}

export function markItemViewed(state, itemId) {
  const item = state.items.find((i) => i.id === itemId);
  if (!item) return null;
  item.viewedAt = Date.now();
  saveSnapState();
  return item;
}

export function expireItem(state, itemId) {
  const item = state.items.find((i) => i.id === itemId);
  if (!item) return null;
  // saved snaps never expire (like Snapchat's Save in Chat)
  if (item.saved) return item;
  item.expired = true;
  saveSnapState();
  return item;
}

export function setItemSaved(state, itemId, saved) {
  const item = state.items.find((i) => i.id === itemId);
  if (!item) return null;
  if (item.kind !== "snap") return null;
  item.saved = !!saved;
  // if saving, ensure it can't be considered expired
  if (item.saved) item.expired = false;
  saveSnapState();
  return item;
}
