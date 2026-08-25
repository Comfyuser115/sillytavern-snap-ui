// Modal for picking which lorebook drives the contact list, and which of
// its entries are active contacts.
import { loadSnapState, setSelectedWorld, setContacts } from "../lib/storage.js";
import { listWorldNames, listEntries } from "../lib/contacts.js";

function escapeHtml(str) {
  return (str || "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[c]);
}

let modalEl = null;

async function renderEntries(worldName, checkedUids) {
  const entries = await listEntries(worldName);
  const listEl = modalEl.find(".snap-view-cm-entries");

  if (!worldName) {
    listEl.html('<div class="snap-view-empty">Pick a lorebook above.</div>');
    return;
  }
  if (entries.length === 0) {
    listEl.html('<div class="snap-view-empty">No entries in this lorebook.</div>');
    return;
  }

  listEl.html(
    entries
      .map(
        (e) => `<label class="snap-view-cm-entry">
          <input type="checkbox" value="${e.uid}" ${checkedUids.has(String(e.uid)) ? "checked" : ""} />
          <span>${escapeHtml(e.name)}</span>
        </label>`,
      )
      .join(""),
  );
}

export async function openContactManager(onSaved) {
  const state = loadSnapState();

  if (!modalEl) {
    modalEl = $('<div class="snap-view-root snap-view-cm-overlay"></div>').appendTo(document.body);
  }

  const worlds = listWorldNames();
  const checkedUids = new Set(state.contacts.map((c) => String(c.uid)));

  modalEl.html(`
    <div class="snap-view-cm-panel">
      <div class="snap-view-header">
        <span>Manage Contacts</span>
        <button class="snap-view-close" title="Close">✕</button>
      </div>
      <div class="snap-view-cm-body">
        <label class="snap-view-cm-label">Lorebook</label>
        <select class="snap-view-cm-world">
          <option value="">Select a lorebook…</option>
          ${worlds.map((w) => `<option value="${escapeHtml(w)}" ${w === state.selectedWorld ? "selected" : ""}>${escapeHtml(w)}</option>`).join("")}
        </select>
        <label class="snap-view-cm-label">Contacts</label>
        <div class="snap-view-cm-entries"></div>
      </div>
      <div class="snap-view-actions">
        <button class="snap-view-btn snap-view-cm-save">Save</button>
      </div>
    </div>
  `);
  modalEl.show();

  modalEl.find(".snap-view-close").on("click", () => modalEl.hide());

  modalEl.find(".snap-view-cm-world").on("change", function () {
    renderEntries($(this).val(), checkedUids);
  });

  modalEl.find(".snap-view-cm-save").on("click", async () => {
    const worldName = modalEl.find(".snap-view-cm-world").val();
    const checked = modalEl
      .find(".snap-view-cm-entries input:checked")
      .map(function () {
        return $(this).val();
      })
      .get();

    const entries = await listEntries(worldName);
    const contacts = entries
      .filter((e) => checked.includes(String(e.uid)))
      .map((e) => ({ uid: e.uid, name: e.name }));

    setSelectedWorld(state, worldName);
    setContacts(state, contacts);
    modalEl.hide();
    if (onSaved) onSaved();
  });

  await renderEntries(state.selectedWorld, checkedUids);
}
