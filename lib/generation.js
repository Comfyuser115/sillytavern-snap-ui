import { generateQuietPrompt } from "../../../../../script.js";
import { buildContactPrompt, buildContactRetryPrompt } from "./promptTemplates.js";

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
    };
  }

  if (result.ok && result.data.type === "text") {
    return { ...base, kind: "text", body: result.data.body };
  }

  // Degrade instead of hard-failing: wrap the raw text as a plain message.
  return { ...base, kind: "text", body: (result.raw || "").trim() || "(no reply)" };
}

// Fires a quiet (non-chat-visible) generation call and returns a fully
// formed Item (text message or snap — the model decides). Retries once
// with a stricter prompt on parse failure, then degrades to a plain text
// item rather than throwing.
export async function requestContactReply({ contactKey, contactName, personaText, recentContext, direction }) {
  const promptArgs = { contactName, personaText, recentContext };

  let raw = await generateQuietPrompt({
    quietPrompt: buildContactPrompt(promptArgs),
    quietToLoud: false,
    skipWIAN: true,
  });
  let result = parseContactResponse(raw);

  if (!result.ok) {
    raw = await generateQuietPrompt({
      quietPrompt: buildContactRetryPrompt(promptArgs),
      quietToLoud: false,
      skipWIAN: true,
    });
    result = parseContactResponse(raw);
  }

  return buildItemFromResult(result, { contactKey, direction });
}
