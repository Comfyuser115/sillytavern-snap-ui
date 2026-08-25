// Phase 2 minimal UI: a single floating panel scoped to the currently
// active character's chat. Mirrors ST's chat log, plus snap bubbles that
// hide their content until tapped (matching Snapchat's chat-list behavior).
// No stories bar / cross-character list yet (Phase 3) — this instance's
// setup is one active character chat at a time, driven off that
// character's own lorebook entry, so a cross-character hub isn't needed
// for the core loop to be useful.
import { loadSnapState, addSnap, getSnapsForCharacter } from "../lib/storage.js";
import { requestSnap, makeSnapId } from "../lib/generation.js";
import { resolvePersona } from "../lib/snapPersona.js";
import { openViewer } from "./snapViewer.js";
import { getContext } from "../../../../st-context.js";
import { this_chid, characters, getCurrentChatId } from "../../../../../script.js";

let panelEl = null;
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

function getRecentContextText(limit = 6) {
  const context = getContext();
  const chat = context.chat || [];
  return chat.slice(-limit).map((m) => `${m.name}: ${m.mes}`).join("\n");
}

function renderMessages(context) {
  return (context.chat || [])
    .map(
      (m) => `<div class="snap-view-msg ${m.is_user ? "snap-view-msg-user" : "snap-view-msg-char"}">
        <div class="snap-view-msg-name">${escapeHtml(m.name)}</div>
        <div class="snap-view-msg-text">${escapeHtml(m.mes)}</div>
      </div>`,
    )
    .join("");
}

function renderSnapBubble(snap, index) {
  const label = snap.expired
    ? "Expired snap"
    : snap.viewedAt !== null
      ? "Opened snap"
      : snap.direction === "incoming"
        ? "📩 New snap — tap to view"
        : "📤 Snap sent";
  return `<div class="snap-view-bubble ${snap.expired ? "snap-view-bubble-expired" : ""}" data-snap-index="${index}">
    <div class="snap-view-bubble-label">${label}</div>
  </div>`;
}

function render() {
  if (!panelEl) return;

  if (this_chid === undefined) {
    panelEl.html('<div class="snap-view-empty">Open a character chat first.</div>');
    return;
  }

  const character = characters[this_chid];
  const characterId = character.avatar;
  const context = getContext();
  const state = loadSnapState();
  const snaps = getSnapsForCharacter(state, characterId).sort((a, b) => a.createdAt - b.createdAt);

  panelEl.html(`
    <div class="snap-view-header">
      <span>${escapeHtml(character.name)}</span>
      <button class="snap-view-close" title="Close">✕</button>
    </div>
    <div class="snap-view-messages">
      ${renderMessages(context)}
      ${snaps.map(renderSnapBubble).join("")}
    </div>
    <div class="snap-view-actions">
      <button class="snap-view-btn snap-view-compose">📷 Send a snap</button>
      <button class="snap-view-btn snap-view-request">✨ Ask for a snap</button>
    </div>
  `);

  const messagesEl = panelEl.find(".snap-view-messages");
  messagesEl.scrollTop(messagesEl[0].scrollHeight);

  panelEl.find(".snap-view-close").on("click", () => toggle(false));

  panelEl.find(".snap-view-bubble").on("click", function () {
    const idx = Number($(this).data("snap-index"));
    const snap = snaps[idx];
    if (!snap || snap.expired) return;
    openViewer(snaps, idx, state, () => render());
  });

  panelEl.find(".snap-view-compose").on("click", () => {
    const description = window.prompt("Describe your snap:");
    if (!description) return;
    const caption = window.prompt("Caption (optional):") || "";
    addSnap(state, {
      id: makeSnapId(),
      characterId,
      chatId: getCurrentChatId(),
      direction: "outgoing",
      description,
      caption,
      mood: undefined,
      createdAt: Date.now(),
      viewedAt: null,
      expiresAfterViewMs: 8000,
      expired: false,
    });
    render();
  });

  panelEl.find(".snap-view-request").on("click", async function () {
    const btn = $(this).prop("disabled", true).text("Generating...");
    try {
      const persona = await resolvePersona(characterId, character.name, state.personas[characterId]);
      const snap = await requestSnap({
        characterId,
        characterName: character.name,
        chatId: getCurrentChatId(),
        direction: "incoming",
        persona,
        recentContext: getRecentContextText(),
      });
      addSnap(state, snap);
      render();
    } catch (e) {
      console.error("[snap-view] failed to generate snap:", e);
      btn.prop("disabled", false).text("✨ Ask for a snap");
    }
  });
}

export function toggle(force) {
  if (!panelEl) return;
  const show = force !== undefined ? force : panelEl.is(":hidden");
  panelEl.toggle(show);
  if (show) render();
}

export function mountSnapOverlay() {
  if (panelEl) return;

  panelEl = $('<div class="snap-view-root snap-view-panel"></div>').appendTo(document.body).hide();

  launcherEl = $('<div class="snap-view-root snap-view-launcher" title="Snaps">📸</div>').appendTo(
    document.body,
  );
  launcherEl.on("click", () => toggle());
}
