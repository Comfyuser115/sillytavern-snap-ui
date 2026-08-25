// Contacts are entries from a lorebook the user picks — not ST character
// cards. Each entry's content is used directly as that contact's persona,
// fetched live (not cached in our own storage) so lorebook edits show up
// without needing to re-sync.
import { world_names, loadWorldInfo } from "../../../../world-info.js";

export function listWorldNames() {
  return world_names || [];
}

export async function listEntries(worldName) {
  if (!worldName) return [];
  const data = await loadWorldInfo(worldName);
  if (!data || !data.entries) return [];
  return Object.values(data.entries)
    .filter((e) => !e.disable)
    .map((e) => ({
      uid: e.uid,
      name: (e.comment || e.key?.[0] || `Entry ${e.uid}`).toString().trim(),
      content: e.content || "",
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function getContactPersona(worldName, uid) {
  const entries = await listEntries(worldName);
  return entries.find((e) => String(e.uid) === String(uid)) || null;
}
