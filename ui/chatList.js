// Home screen: the Snapchat-style chat list. One row per configured
// contact (lorebook entries picked in the contact manager), tap to open
// their thread.
import { loadSnapState, getLastItemForContact, hasUnreadForContact } from "../lib/storage.js";
import { openContactManager } from "./contactManager.js";
import { openThread } from "./chatThread.js";

let listEl = null;
let launcherEl = null;

function escapeHtml(str) {
  return (str || "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[c]);
}

function avatarColor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) & 0xffffff;
  const hue = hash % 360;
  return `hsl(${hue}, 55%, 45%)`;
}

function formatTimeAgo(ts) {
  if (!ts) return "";
  const mins = Math.max(0, Math.round((Date.now() - ts) / 60000));
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

function previewLabel(item, contactName) {
  if (!item) return "Say hi 👋";
  if (item.kind === "snap") {
    if (item.expired) return "Expired snap";
    if (item.viewedAt !== null) return "Opened snap";
    return item.direction === "incoming" ? "New Snap" : "Snap sent";
  }
  return item.direction === "incoming" ? item.body : `You: ${item.body}`;
}

function renderRow(contact, state) {
  const item = getLastItemForContact(state, String(contact.uid));
  const unread = hasUnreadForContact(state, String(contact.uid));
  return `<div class="snap-view-row" data-uid="${contact.uid}">
    <div class="snap-view-row-avatar" style="background:${avatarColor(contact.name)}">${escapeHtml(contact.name[0] || "?")}</div>
    <div class="snap-view-row-main">
      <div class="snap-view-row-name">${escapeHtml(contact.name)}</div>
      <div class="snap-view-row-preview ${unread ? "snap-view-row-unread" : ""}">${escapeHtml(previewLabel(item, contact.name))}</div>
    </div>
    <div class="snap-view-row-time">${item ? formatTimeAgo(item.createdAt) : ""}</div>
    ${unread ? '<div class="snap-view-row-dot"></div>' : ""}
  </div>`;
}

function render() {
  if (!listEl) return;
  const state = loadSnapState();

  listEl.html(`
    <div class="snap-view-header">
      <span>Chat</span>
      <button class="snap-view-manage" title="Manage contacts">⚙️</button>
      <button class="snap-view-close" title="Close">✕</button>
    </div>
    <div class="snap-view-rows">
      ${
        state.contacts.length === 0
          ? '<div class="snap-view-empty">No contacts yet — tap ⚙️ to add some from a lorebook.</div>'
          : state.contacts.map((c) => renderRow(c, state)).join("")
      }
    </div>
  `);

  listEl.find(".snap-view-close").on("click", () => toggle(false));
  listEl.find(".snap-view-manage").on("click", () => openContactManager(() => render()));
  listEl.find(".snap-view-row").on("click", function () {
    const uid = $(this).data("uid");
    const contact = state.contacts.find((c) => String(c.uid) === String(uid));
    if (!contact) return;
    listEl.hide();
    openThread(contact, () => {
      listEl.show();
      render();
    });
  });
}

export function toggle(force) {
  if (!listEl) return;
  const show = force !== undefined ? force : listEl.is(":hidden");
  listEl.toggle(show);
  if (show) render();
}

export function mountSnapOverlay() {
  if (listEl) return;

  listEl = $('<div class="snap-view-root snap-view-panel"></div>').appendTo(document.body).hide();

  launcherEl = $('<div class="snap-view-root snap-view-launcher" title="Snaps">📸</div>').appendTo(
    document.body,
  );
  launcherEl.on("click", () => toggle());
}
