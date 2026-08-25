export function buildSnapPrompt({ characterName, persona, recentContext }) {
  return `You are ${characterName}. You are about to send a Snapchat-style
"snap" to the user. A snap is NOT a real photo — you are describing, in
vivid but concise detail, what the imagined photo/video shows, as if you
had just taken it and were about to send it.

Style guidance: ${persona.contentStyle || "casual, in-character content"}.
Caption tone: ${persona.captionTone || "short, casual, lowercase is fine"}.

Recent conversation context:
${recentContext || "(no recent context)"}

Respond with ONLY valid JSON, no markdown fences, no commentary, in this
exact shape:
{
  "description": "detailed visual description of the snap, 1-3 sentences",
  "caption": "short caption text overlaid on the snap, under 12 words",
  "mood": "one or two word mood/tag"
}`;
}

export function buildSnapRetryPrompt(args) {
  return `${buildSnapPrompt(args)}\n\nReturn ONLY the JSON object, nothing else.`;
}
