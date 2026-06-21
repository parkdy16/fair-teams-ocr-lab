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

function normalizeMimeType(value, fallback = "audio/webm") {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  const text = raw || fallback;

  // Browser MediaRecorder often returns values like "audio/webm;codecs=opus".
  // OpenAI cares most that the uploaded file extension/container match the bytes,
  // so keep only the canonical container MIME type.
  if (text.includes("webm")) return "audio/webm";
  if (text.includes("mp4") || text.includes("m4a") || text.includes("aac")) return "audio/m4a";
  if (text.includes("mpeg") || text.includes("mp3")) return "audio/mpeg";
  if (text.includes("wav") || text.includes("wave")) return "audio/wav";
  if (text.includes("ogg") || text.includes("opus")) return "audio/ogg";
  if (/^audio\/[a-z0-9.+-]+$/.test(text)) return text;
  return fallback;
}

function parseAudioBase64(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const trimmed = value.trim();
  const match = trimmed.match(/^data:([^,]+);base64,(.+)$/s);
  const mimeType = normalizeMimeType(match?.[1] || "audio/webm");
  const body = (match?.[2] || trimmed).replace(/\s/g, "");
  const buffer = Buffer.from(body, "base64");
  if (!buffer.length) return null;
  return { buffer, mimeType };
}

function inferMimeTypeFromBytes(buffer, fallback) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) return fallback;
  const start4 = buffer.subarray(0, 4).toString("hex");
  const start12 = buffer.subarray(0, 12).toString("latin1");

  // EBML header: WebM/Matroska
  if (start4 === "1a45dfa3") return "audio/webm";
  // RIFF....WAVE
  if (start12.startsWith("RIFF") && start12.includes("WAVE")) return "audio/wav";
  // ID3 tag or MPEG frame sync
  if (buffer.subarray(0, 3).toString("latin1") === "ID3" || (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0)) return "audio/mpeg";
  // MP4/M4A usually has ftyp at bytes 4-7
  if (buffer.subarray(4, 8).toString("latin1") === "ftyp") return "audio/m4a";
  // OggS
  if (buffer.subarray(0, 4).toString("latin1") === "OggS") return "audio/ogg";

  return fallback;
}

function extensionForMime(mimeType) {
  const text = normalizeMimeType(mimeType);
  if (text === "audio/m4a" || text === "audio/mp4") return "m4a";
  if (text === "audio/mpeg") return "mp3";
  if (text === "audio/wav") return "wav";
  if (text === "audio/ogg") return "ogg";
  return "webm";
}

function shortAudioDebug(buffer) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) return "empty";
  return buffer.subarray(0, Math.min(buffer.length, 12)).toString("hex");
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

  const declaredMimeType = normalizeMimeType(body.mimeType, parsedAudio.mimeType);
  const mimeType = inferMimeTypeFromBytes(parsedAudio.buffer, declaredMimeType);
  const filename = `fair-teams-voice.${extensionForMime(mimeType)}`;

  // Useful in Vercel logs while testing Android/Samsung voice capture. Does not log audio content.
  console.log("Fair Teams voice upload", {
    declaredMimeType,
    parsedMimeType: parsedAudio.mimeType,
    finalMimeType: mimeType,
    filename,
    size: parsedAudio.buffer.length,
    headerHex: shortAudioDebug(parsedAudio.buffer),
  });

  if (parsedAudio.buffer.length < 1024) {
    return json(res, 400, { error: "The voice recording was too short or empty. Try again and speak for a moment longer." });
  }

  const audioBlob = new Blob([parsedAudio.buffer], { type: mimeType });
  const form = new FormData();
  form.append("model", DEFAULT_TRANSCRIBE_MODEL);
  form.append("file", audioBlob, filename);
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
      console.error("Fair Teams voice OpenAI error", {
        status: response.status,
        message,
        finalMimeType: mimeType,
        filename,
        size: parsedAudio.buffer.length,
        headerHex: shortAudioDebug(parsedAudio.buffer),
      });
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
