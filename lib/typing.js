// In-memory typing state shared between generation and UI.
// ChatList reads it to show "typing…" on the affected row while
// ChatThread shows a bubble. Global so ambient replies are visible too.

const typingKeys = new Set();
const listeners = new Set();

function notify() {
  for (const cb of listeners) {
    try {
      cb();
    } catch (e) {
      console.warn("[snap-view] typing listener error:", e);
    }
  }
}

export function setTyping(contactKey) {
  const k = String(contactKey);
  if (!typingKeys.has(k)) {
    typingKeys.add(k);
    notify();
  }
}

export function clearTyping(contactKey) {
  const k = String(contactKey);
  if (typingKeys.delete(k)) {
    notify();
  }
}

export function isTyping(contactKey) {
  return typingKeys.has(String(contactKey));
}

export function onTypingChange(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
