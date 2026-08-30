import { buildContactPrompt, buildContactRetryPrompt } from "./promptTemplates.js";
import { setTyping, clearTyping } from "./typing.js";

function getGenerateQuietPrompt() {
  if (typeof SillyTavern !== "undefined" && SillyTavern.getContext) {
    const ctx = SillyTavern.getContext();
    if (ctx && typeof ctx.generateQuietPrompt === "function") return ctx.generateQuietPrompt.bind(ctx);
  }
  // fallback to direct import for older ST versions — dynamic so bundling doesn't fail if path missing
  try {
    // eslint-disable-next-line no-undef
    const gqp = globalThis.generateQuietPrompt || globalThis.SillyTavern?.generateQuietPrompt;
    if (typeof gqp === "function") return gqp;
  } catch {}
  return null;
}

async function callGenerateQuietPrompt(args) {
  const fn = getGenerateQuietPrompt();
  if (fn) return await fn(args);
  // last resort: try legacy import
  const { generateQuietPrompt } = await import("../../../../../script.js");
  return await generateQuietPrompt(args);
}

const DEFAULT_EXPIRES_AFTER_VIEW_MS = 8000;

// crypto.randomUUID() requires a secure context (HTTPS/localhost); ST is
// commonly served over plain HTTP on a LAN, so fall back to a non-crypto
// v4-shaped id in that case. Uniqueness only, no security properties needed.
export function makeSnapId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function parseContactResponse(raw) {
  const cleaned = (raw || "").trim().replace(/^```json\s*|```$/g, "").trim();
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    return { ok: false, raw };
  }
  if (parsed.type === "text" && parsed.body) return { ok: true, data: parsed, raw };
  if (parsed.type === "snap" && parsed.description && parsed.caption) return { ok: true, data: parsed, raw };
  return { ok: false, raw };
}

function buildItemFromResult(result, { contactKey, direction }) {
  const base = {
    id: makeSnapId(),
    contactKey,
    direction,
    createdAt: Date.now(),
    viewedAt: null,
    expiresAfterViewMs: DEFAULT_EXPIRES_AFTER_VIEW_MS,
    expired: false,
    raw: result.raw,
  };

  if (result.ok && result.data.type === "snap") {
    return {
      ...base,
      kind: "snap",
      description: result.data.description,
      caption: result.data.caption,
      mood: result.data.mood,
      saved: false,
    };
  }

  if (result.ok && result.data.type === "text") {
    return { ...base, kind: "text", body: result.data.body };
  }

  // Degrade instead of hard-failing: wrap the raw text as a plain message.
  return { ...base, kind: "text", body: (result.raw || "").trim() || "(no reply)" };
}

// Fires a quiet (non-chat-visible) generation call using whatever
// connection profile the user currently has selected (manual switching).
// Retries once with a stricter prompt on parse failure, then degrades to
// a plain text item rather than throwing.
let lastGenerationAt = 0;
const MIN_GAP_MS = 8000;

export async function requestContactReply({ contactKey, contactName, personaText, recentContext, direction }) {
  const promptArgs = { contactName, personaText, recentContext };
  const keyStr = String(contactKey);
  // global throttle — prevents back-to-back calls from hammering the API
  const sinceLast = Date.now() - lastGenerationAt;
  if (sinceLast < MIN_GAP_MS) {
    await new Promise((r) => setTimeout(r, MIN_GAP_MS - sinceLast));
  }
  setTyping(keyStr);
  try {
    let raw = await callGenerateQuietPrompt({
      quietPrompt: buildContactPrompt(promptArgs),
      quietToLoud: false,
      skipWIAN: true,
    });
    let result = parseContactResponse(raw);

    if (!result.ok) {
      raw = await callGenerateQuietPrompt({
        quietPrompt: buildContactRetryPrompt(promptArgs),
        quietToLoud: false,
        skipWIAN: true,
      });
      result = parseContactResponse(raw);
    }

    lastGenerationAt = Date.now();
    return buildItemFromResult(result, { contactKey, direction });
  } finally {
    clearTyping(keyStr);
    if (lastGenerationAt === 0) lastGenerationAt = Date.now();
  }
}
