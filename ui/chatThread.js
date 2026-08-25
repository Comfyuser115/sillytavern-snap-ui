// Per-contact thread: self-contained conversation stored entirely in
// snap-view's own state (not mirroring ST's main chat), since contacts are
// lorebook entries rather than real ST characters/chats. Text items render
// as normal bubbles; snap items stay hidden until tapped, opening the
// full-screen viewer.
import { loadSnapState, addItem, getItemsForContact } from "../lib/storage.js";
import { requestContactReply, makeSnapId } from "../lib/generation.js";
import { getContactPersona } from "../lib/contacts.js";
import { openViewer } from "./snapViewer.js";

let panelEl = null;
let activeContact = null; // { uid, name }
let onLeaveCb = null;

function escapeHtml(str) {
  return (str || "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[c]);
}

function getRecentContextText(items, limit = 8) {
  return items
    .slice(-limit)
    .map((i) => {
      const who = i.direction === "incoming" ? activeContact.name : "{{user}}";
      const what = i.kind === "snap" ? `[sent a snap: ${i.description}]` : i.body;
      return `${who}: ${what}`;
    })
    .join("\n");
}

function renderTextBubble(item) {
  const side = item.direction === "incoming" ? "snap-view-msg-char" : "snap-view-msg-user";
  return `<div class="snap-view-msg ${side}"><div class="snap-view-msg-text">${escapeHtml(item.body)}</div></div>`;
}

function renderSnapBubble(item, index) {
  const label = item.expired
    ? "Expired snap"
    : item.viewedAt !== null
      ? "Opened snap"
      : item.direction === "incoming"
        ? "📩 New snap — tap to view"
        : "📤 Snap sent";
  return `<div class="snap-view-bubble ${item.expired ? "snap-view-bubble-expired" : ""}" data-snap-index="${index}">
    <div class="snap-view-bubble-label">${label}</div>
  </div>`;
}

async function triggerAmbientReply(state, contact) {
  try {
    const persona = await getContactPersona(state.selectedWorld, contact.uid);
    const items = getItemsForContact(state, String(contact.uid));
    const item = await requestContactReply({
      contactKey: String(contact.uid),
      contactName: contact.name,
      personaText: persona?.content,
      recentContext: getRecentContextText(items),
      direction: "incoming",
    });
    addItem(state, item);
  } catch (e) {
    console.error("[snap-view] ambient reply failed:", e);
  }
}

function render() {
  if (!panelEl || !activeContact) return;

  const state = loadSnapState();
  const items = getItemsForContact(state, String(activeContact.uid)).sort(
    (a, b) => a.createdAt - b.createdAt,
  );
  const snapItems = items.filter((i) => i.kind === "snap");

  panelEl.html(`
    <div class="snap-view-header">
      <button class="snap-view-back" title="Back">←</button>
      <span>${escapeHtml(activeContact.name)}</span>
      <span style="width:20px"></span>
    </div>
    <div class="snap-view-messages">
      ${items
        .map((item) => (item.kind === "text" ? renderTextBubble(item) : renderSnapBubble(item, snapItems.indexOf(item))))
        .join("")}
    </div>
    <div class="snap-view-actions snap-view-actions-thread">
      <input type="text" class="snap-view-input" placeholder="Send a message..." />
      <button class="snap-view-btn snap-view-send">Send</button>
      <button class="snap-view-btn snap-view-compose" title="Send a snap">📷</button>
    </div>
  `);

  const messagesEl = panelEl.find(".snap-view-messages");
  messagesEl.scrollTop(messagesEl[0].scrollHeight);

  panelEl.find(".snap-view-back").on("click", () => leaveThread());

  panelEl.find(".snap-view-bubble").on("click", function () {
    const idx = Number($(this).data("snap-index"));
    const snap = snapItems[idx];
    if (!snap || snap.expired) return;
    openViewer(snapItems, idx, state, () => render());
  });

  async function sendText() {
    const input = panelEl.find(".snap-view-input");
    const text = input.val().trim();
    if (!text) return;
    input.val("").prop("disabled", true);

    addItem(state, {
      id: makeSnapId(),
      contactKey: String(activeContact.uid),
      direction: "outgoing",
      kind: "text",
      body: text,
      createdAt: Date.now(),
      viewedAt: Date.now(),
      expiresAfterViewMs: 0,
      expired: false,
    });
    render();

    try {
      const persona = await getContactPersona(state.selectedWorld, activeContact.uid);
      const freshItems = getItemsForContact(state, String(activeContact.uid));
      const reply = await requestContactReply({
        contactKey: String(activeContact.uid),
        contactName: activeContact.name,
        personaText: persona?.content,
        recentContext: getRecentContextText(freshItems),
        direction: "incoming",
      });
      addItem(state, reply);
      render();
    } catch (e) {
      console.error("[snap-view] reply failed:", e);
    }
  }

  panelEl.find(".snap-view-send").on("click", sendText);
  panelEl.find(".snap-view-input").on("keydown", (e) => {
    if (e.key === "Enter") sendText();
  });

  panelEl.find(".snap-view-compose").on("click", () => {
    const description = window.prompt("Describe your snap:");
    if (!description) return;
    const caption = window.prompt("Caption (optional):") || "";
    addItem(state, {
      id: makeSnapId(),
      contactKey: String(activeContact.uid),
      direction: "outgoing",
      kind: "snap",
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
}

function leaveThread() {
  const state = loadSnapState();
  const contact = activeContact;
  activeContact = null;
  if (panelEl) panelEl.hide().empty();
  // "They text you while you're away": fire a background reply for the
  // contact you just left, so something's waiting next time you open it.
  if (contact) triggerAmbientReply(state, contact);
  if (onLeaveCb) onLeaveCb();
}

export function openThread(contact, onLeave) {
  activeContact = contact;
  onLeaveCb = onLeave;
  if (!panelEl) {
    panelEl = $('<div class="snap-view-root snap-view-panel"></div>').appendTo(document.body);
  }
  panelEl.show();
  render();
}
