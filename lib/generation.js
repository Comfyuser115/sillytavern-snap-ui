import { generateQuietPrompt } from "../../../../../script.js";
import { buildSnapPrompt, buildSnapRetryPrompt } from "./promptTemplates.js";

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

export function parseSnapResponse(raw) {
  const cleaned = (raw || "").trim().replace(/^```json\s*|```$/g, "").trim();
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    return { ok: false, error: "invalid_json", raw };
  }
  if (!parsed.description || !parsed.caption) {
    return { ok: false, error: "missing_fields", raw };
  }
  return { ok: true, data: parsed, raw };
}

function buildSnapFromResult(result, { characterId, chatId, direction }) {
  const base = {
    id: makeSnapId(),
    characterId,
    chatId,
    direction,
    createdAt: Date.now(),
    viewedAt: null,
    expiresAfterViewMs: DEFAULT_EXPIRES_AFTER_VIEW_MS,
    expired: false,
    raw: result.raw,
  };

  if (result.ok) {
    return {
      ...base,
      description: result.data.description,
      caption: result.data.caption,
      mood: result.data.mood,
    };
  }

  // Degrade instead of hard-failing: wrap the raw text as the description.
  return {
    ...base,
    description: (result.raw || "").trim() || "(the snap didn't load right)",
    caption: "a snap",
    mood: undefined,
  };
}

// Fires a quiet (non-chat-visible) generation call and returns a fully
// formed Snap object. Retries once with a stricter prompt on parse failure,
// then falls back to a degraded snap rather than throwing.
export async function requestSnap({ characterId, characterName, chatId, direction, persona, recentContext }) {
  const promptArgs = { characterName, persona: persona || {}, recentContext };

  let raw = await generateQuietPrompt({
    quietPrompt: buildSnapPrompt(promptArgs),
    quietToLoud: false,
    skipWIAN: true,
  });
  let result = parseSnapResponse(raw);

  if (!result.ok) {
    raw = await generateQuietPrompt({
      quietPrompt: buildSnapRetryPrompt(promptArgs),
      quietToLoud: false,
      skipWIAN: true,
    });
    result = parseSnapResponse(raw);
  }

  return buildSnapFromResult(result, { characterId, chatId, direction });
}
