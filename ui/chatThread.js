// Per-contact thread: self-contained conversation stored entirely in
// snap-view's own state (not mirroring ST's main chat), since contacts are
// lorebook entries rather than real ST characters/chats. Text items render
// as normal bubbles; snap items stay hidden until tapped, opening the
// full-screen viewer.
import { loadSnapState, addItem, getItemsForContact, setItemSaved } from "../lib/storage.js";
import { requestContactReply, makeSnapId } from "../lib/generation.js";
import { getContactPersona } from "../lib/contacts.js";
import { isTyping, setTyping, clearTyping, onTypingChange } from "../lib/typing.js";
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

function getRecentContextText(items, contactName, limit = 8) {
  return items
    .slice(-limit)
    .map((i) => {
      const who = i.direction === "incoming" ? contactName : "{{user}}";
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
  if (item.saved) {
    return `<div class="snap-view-bubble snap-view-bubble-saved" data-snap-index="${index}" data-snap-id="${escapeHtml(item.id)}">
    <div class="snap-view-bubble-label">📌 Saved • tap to replay</div>
    <button class="snap-view-bubble-save" data-unsave="${escapeHtml(item.id)}" title="Unsave">Unsave</button>
  </div>`;
  }
  if (item.expired) {
    return `<div class="snap-view-bubble snap-view-bubble-expired"><div class="snap-view-bubble-label">Expired snap</div></div>`;
  }
  const label =
    item.viewedAt !== null
      ? "Opened snap"
      : item.direction === "incoming"
        ? "📩 New snap — tap to view"
        : "📤 Snap sent";
  const saveBtn = item.kind === "snap" ? `<button class="snap-view-bubble-save" data-save="${escapeHtml(item.id)}" title="Save in Chat">Save</button>` : "";
  return `<div class="snap-view-bubble ${item.viewedAt !== null ? "snap-view-bubble-opened" : ""}" data-snap-index="${index}" data-snap-id="${escapeHtml(item.id)}">
    <div class="snap-view-bubble-label">${label}</div>
    ${saveBtn}
  </div>`;
}

async function triggerAmbientReply(state, contact) {
  const keyStr = String(contact.uid);

  // Dedup: already generating for this contact
  if (isTyping(keyStr)) return;

  // Only reply if the last item is from the user (outgoing) — i.e. they
  // have something to reply to. If last is incoming (or no history),
  // there's nothing pending, so skip and avoid spam / 429s.
  const items = getItemsForContact(state, keyStr);
  if (items.length === 0) return;
  const last = [...items].sort((a, b) => b.createdAt - a.createdAt)[0];
  if (!last || last.direction !== "outgoing") return;

  // Cooldown: don't re-trigger within 45s (prevents rapid leave/re-enter
  // from queueing duplicate generations and hammering the API).
  const now = Date.now();
  state.lastAmbientAt = state.lastAmbientAt || {};
  const lastAttempt = state.lastAmbientAt[keyStr] || 0;
  if (now - lastAttempt < 45000) return;
  state.lastAmbientAt[keyStr] = now;

  // Persist the attempt timestamp (debounce even if generation fails, so
  // a 429 doesn't immediately retry in a tight loop — the next leave
  // after cooldown will retry).
  try {
    const { saveSnapState } = await import("../lib/storage.js");
    saveSnapState();
  } catch {}

  try {
    const persona = await getContactPersona(state.selectedWorld, contact.uid);
    const freshItems = getItemsForContact(state, keyStr);
    // Re-check: user may have already gotten a reply while persona was loading
    const freshLast = [...freshItems].sort((a, b) => b.createdAt - a.createdAt)[0];
    if (!freshLast || freshLast.direction !== "outgoing") return;

    const item = await requestContactReply({
      contactKey: keyStr,
      contactName: contact.name,
      personaText: persona?.content,
      recentContext: getRecentContextText(freshItems, contact.name),
      direction: "incoming",
    });
    addItem(state, item);
  } catch (e) {
    const msg = (e?.message || e?.toString() || "").toLowerCase();
    const isRateLimit = msg.includes("too many requests") || msg.includes("429") || e?.status === 429;
    if (isRateLimit) {
      // quiet — 429s are expected when the small model is busy; use debug
      // so the console isn't spammed, and back off 60s instead of 30s.
      console.debug(`[snap-view] ambient rate-limited for ${contact.name}, retry after cooldown`);
      state.lastAmbientAt[keyStr] = Date.now() + 30000; // extra 30s on top of base 30s = 60s total
      try {
        const { saveSnapState } = await import("../lib/storage.js");
        saveSnapState();
      } catch {}
    } else {
      console.error("[snap-view] ambient reply failed:", e);
    }
  }
}

function render() {
  if (!panelEl || !activeContact) return;

  const state = loadSnapState();
  const items = getItemsForContact(state, String(activeContact.uid)).sort(
    (a, b) => a.createdAt - b.createdAt,
  );
  const snapItems = items.filter((i) => i.kind === "snap");
  const typing = isTyping(String(activeContact.uid));

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
      ${
        typing
          ? `<div class="snap-view-typing"><span class="snap-view-typing-dots"><span></span><span></span><span></span></span> <span class="snap-view-typing-label">${escapeHtml(activeContact.name)} is typing…</span></div>`
          : ""
      }
    </div>
    <div class="snap-view-actions snap-view-actions-thread">
      <input type="text" class="snap-view-input" placeholder="Send a message..." ${typing ? "disabled" : ""} />
      <button class="snap-view-btn snap-view-send" ${typing ? "disabled" : ""}>Send</button>
      <button class="snap-view-btn snap-view-compose" title="Send a snap" ${typing ? "disabled" : ""}>📷</button>
    </div>
  `);

  const messagesEl = panelEl.find(".snap-view-messages");
  messagesEl.scrollTop(messagesEl[0].scrollHeight);

  panelEl.find(".snap-view-back").on("click", () => leaveThread());

  panelEl.find(".snap-view-bubble").on("click", function (e) {
    if ($(e.target).closest(".snap-view-bubble-save").length) return;
    const idx = Number($(this).data("snap-index"));
    const snap = snapItems[idx];
    if (!snap || (snap.expired && !snap.saved)) return;
    openViewer(snapItems, idx, state, () => render());
  });

  panelEl.find("[data-save]").on("click", function (e) {
    e.stopPropagation();
    const id = $(this).data("save");
    setItemSaved(state, id, true);
    render();
  });

  panelEl.find("[data-unsave]").on("click", function (e) {
    e.stopPropagation();
    const id = $(this).data("unsave");
    setItemSaved(state, id, false);
    render();
  });

  async function sendText() {
    const input = panelEl.find(".snap-view-input");
    const text = input.val().trim();
    if (!text) return;
    const keyStr = String(activeContact.uid);
    input.val("").prop("disabled", true);

    addItem(state, {
      id: makeSnapId(),
      contactKey: keyStr,
      direction: "outgoing",
      kind: "text",
      body: text,
      createdAt: Date.now(),
      viewedAt: Date.now(),
      expiresAfterViewMs: 0,
      expired: false,
    });
    // show typing immediately, before persona fetch / profile switch
    setTyping(keyStr);
    render();

    try {
      const persona = await getContactPersona(state.selectedWorld, activeContact.uid);
      const freshItems = getItemsForContact(state, keyStr);
      const reply = await requestContactReply({
        contactKey: keyStr,
        contactName: activeContact.name,
        personaText: persona?.content,
        recentContext: getRecentContextText(freshItems, activeContact.name),
        direction: "incoming",
      });
      addItem(state, reply);
    } catch (e) {
      console.error("[snap-view] reply failed:", e);
    } finally {
      clearTyping(keyStr);
      render();
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
      saved: false,
    });
    render();
  });
}

function leaveThread() {
  const state = loadSnapState();
  const contact = activeContact;
  activeContact = null;
  if (typingUnsub) {
    typingUnsub();
    typingUnsub = null;
  }
  if (panelEl) panelEl.hide().empty();
  // Delay ambient by 2.5s so a rapid leave/re-enter doesn't instantly
  // hammer the API and respects the global 8s gap in generation.js.
  if (contact) {
    setTimeout(() => {
      const fresh = loadSnapState();
      const live = fresh.contacts.find((c) => String(c.uid) === String(contact.uid));
      if (live) triggerAmbientReply(fresh, live);
    }, 2500);
  }

  // Opportunistic sweep: if another contact has a pending reply that
  // previously hit a 429/cooldown, piggyback a single retry when you
  // return to the chat list. Limits to 1 per leave to avoid bursts.
  setTimeout(() => {
    try {
      const fresh = loadSnapState();
      for (const c of fresh.contacts || []) {
        if (contact && String(c.uid) === String(contact.uid)) continue;
        if (isTyping(String(c.uid))) continue;
        const its = getItemsForContact(fresh, String(c.uid));
        if (its.length === 0) continue;
        const last = [...its].sort((a, b) => b.createdAt - a.createdAt)[0];
        if (!last || last.direction !== "outgoing") continue;
        const lastAtt = fresh.lastAmbientAt?.[String(c.uid)] || 0;
        if (Date.now() - lastAtt < 60000) continue;
        triggerAmbientReply(fresh, c);
        break;
      }
    } catch {}
  }, 4000);

  if (onLeaveCb) onLeaveCb();
}

let typingUnsub = null;

export function openThread(contact, onLeave) {
  activeContact = contact;
  onLeaveCb = onLeave;
  if (!panelEl) {
    panelEl = $('<div class="snap-view-root snap-view-panel"></div>').appendTo(document.body);
  }
  panelEl.show();
  render();
  if (typingUnsub) typingUnsub();
  typingUnsub = onTypingChange(() => {
    if (activeContact && isTyping(String(activeContact.uid))) render();
    else if (activeContact) render();
  });
}
