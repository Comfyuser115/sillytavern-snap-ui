// Full-screen tap-to-reveal snap viewer: progress bar fills over
// expiresAfterViewMs, tap zones move left/right, closing marks the snap
// expired so it can't be reopened (data stays in storage for the
// "memory"/context-injection layer — only the UI is gated).
import { markItemViewed, expireItem } from "../lib/storage.js";

function escapeHtml(str) {
  return (str || "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[c]);
}

let overlayEl = null;
let timerHandle = null;
let currentSnaps = [];
let currentIndex = 0;
let stateRef = null;
let onCloseCb = null;

function clearTimer() {
  if (timerHandle) {
    clearTimeout(timerHandle);
    timerHandle = null;
  }
}

function renderCurrent() {
  const snap = currentSnaps[currentIndex];
  if (!snap) {
    closeViewer();
    return;
  }

  if (snap.viewedAt === null) {
    markItemViewed(stateRef, snap.id);
  }

  overlayEl.html(`
    <div class="snap-view-viewer-progress-track"><div class="snap-view-viewer-progress-fill"></div></div>
    <div class="snap-view-viewer-card">
      <div class="snap-view-viewer-desc">${escapeHtml(snap.description)}</div>
      <div class="snap-view-viewer-caption">${escapeHtml(snap.caption)}</div>
    </div>
    <div class="snap-view-viewer-zone snap-view-viewer-zone-left"></div>
    <div class="snap-view-viewer-zone snap-view-viewer-zone-right"></div>
  `);

  const fill = overlayEl.find(".snap-view-viewer-progress-fill");
  fill.css({ transition: "none", width: "0%" });
  requestAnimationFrame(() => {
    fill.css({ transition: `width ${snap.expiresAfterViewMs}ms linear`, width: "100%" });
  });

  overlayEl.find(".snap-view-viewer-zone-left").on("click", () => goTo(currentIndex - 1));
  overlayEl.find(".snap-view-viewer-zone-right").on("click", () => goTo(currentIndex + 1));

  clearTimer();
  timerHandle = setTimeout(() => {
    expireItem(stateRef, snap.id);
    goTo(currentIndex + 1);
  }, snap.expiresAfterViewMs);
}

function goTo(index) {
  clearTimer();
  if (index < 0 || index >= currentSnaps.length) {
    closeViewer();
    return;
  }
  currentIndex = index;
  renderCurrent();
}

export function openViewer(snaps, startIndex, state, onClose) {
  currentSnaps = snaps;
  currentIndex = startIndex;
  stateRef = state;
  onCloseCb = onClose;

  if (!overlayEl) {
    overlayEl = $('<div class="snap-view-root snap-view-viewer-overlay"></div>').appendTo(document.body);
  }
  overlayEl.show();
  renderCurrent();
}

export function closeViewer() {
  clearTimer();
  if (overlayEl) overlayEl.hide().empty();
  const cb = onCloseCb;
  onCloseCb = null;
  if (cb) cb();
}
