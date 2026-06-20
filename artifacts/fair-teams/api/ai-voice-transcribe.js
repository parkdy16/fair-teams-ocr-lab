const OPENAI_TRANSCRIPTIONS_URL = "https://api.openai.com/v1/audio/transcriptions";
const DEFAULT_TRANSCRIBE_MODEL = process.env.OPENAI_VOICE_TRANSCRIBE_MODEL || "gpt-4o-mini-transcribe";
const MAX_AUDIO_BYTES = 12 * 1024 * 1024;

function serverEnabled() {
  return String(process.env.AI_SMART_COMMAND_SERVER_ENABLED || "").toLowerCase() === "true";
}

function getAllowedBranch() {
  return process.env.AI_SMART_COMMAND_ALLOWED_BRANCH || "";
}

function runningBranch() {
  return process.env.VERCEL_GIT_COMMIT_REF || process.env.VERCEL_BRANCH_URL || "";
}

function branchAllowed() {
  const allowed = getAllowedBranch().trim();
  if (!allowed) return true;
  const branch = runningBranch();
  return branch === allowed || branch.includes(allowed);
}

function json(res, status, payload) {
  res.status(status).setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

function parseAudioBase64(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const trimmed = value.trim();
  const match = trimmed.match(/^data:([^;]+);base64,(.+)$/);
  const mimeType = match?.[1] || "audio/webm";
  const body = match?.[2] || trimmed;
  const buffer = Buffer.from(body, "base64");
  if (!buffer.length) return null;
  return { buffer, mimeType };
}

function cleanMimeType(value, fallback) {
  const text = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (/^audio\/[a-z0-9.+-]+/.test(text)) return text;
  return fallback || "audio/webm";
}

function extensionForMime(mimeType) {
  if (/mp4|m4a/.test(mimeType)) return "m4a";
  if (/mpeg|mp3/.test(mimeType)) return "mp3";
  if (/wav/.test(mimeType)) return "wav";
  if (/ogg/.test(mimeType)) return "ogg";
  return "webm";
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return json(res, 405, { error: "Method not allowed" });
  }

  if (!serverEnabled()) {
    return json(res, 403, { error: "Fair Teams AI is disabled for this deployment." });
  }
  if (!branchAllowed()) {
    return json(res, 403, { error: "Fair Teams AI is not enabled for this branch." });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return json(res, 500, { error: "OpenAI API key is not configured." });
  }

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const parsedAudio = parseAudioBase64(body.audioBase64);
  if (!parsedAudio) {
    return json(res, 400, { error: "No voice recording was received." });
  }
  if (parsedAudio.buffer.length > MAX_AUDIO_BYTES) {
    return json(res, 413, { error: "Voice recording is too long. Try a shorter command." });
  }

  const mimeType = cleanMimeType(body.mimeType, parsedAudio.mimeType);
  const audioBlob = new Blob([parsedAudio.buffer], { type: mimeType });
  const form = new FormData();
  form.append("model", DEFAULT_TRANSCRIBE_MODEL);
  form.append("file", audioBlob, `fair-teams-voice.${extensionForMime(mimeType)}`);
  form.append("response_format", "json");

  try {
    const response = await fetch(OPENAI_TRANSCRIPTIONS_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const message = payload?.error?.message || "OpenAI transcription failed.";
      return json(res, response.status, { error: message });
    }

    const transcript = typeof payload?.text === "string" ? payload.text.trim() : "";
    if (!transcript) {
      return json(res, 422, { error: "I could not hear a clear command. Try again closer to the phone." });
    }

    return json(res, 200, {
      ok: true,
      transcript,
      language: typeof payload?.language === "string" ? payload.language : undefined,
      model: DEFAULT_TRANSCRIBE_MODEL,
    });
  } catch (error) {
    console.error("Fair Teams voice transcription failed", error);
    return json(res, 502, { error: "Fair Teams voice could not connect cleanly. Try again in a moment." });
  }
}
