import "server-only";

// Transcribes an audio file with OpenAI's Whisper API.
// Docs: https://platform.openai.com/docs/api-reference/audio/createTranscription
export async function transcribeAudio(audio: Blob, filename: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Transcription isn't set up: OPENAI_API_KEY is missing.");
  }

  const body = new FormData();
  body.append("file", audio, filename);
  body.append("model", "whisper-1");
  body.append("response_format", "json");

  const baseUrl = process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";
  const res = await fetch(`${baseUrl}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body,
    signal: AbortSignal.timeout(120_000),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error("Whisper transcription failed", res.status, detail);
    throw new Error(
      res.status === 401 || res.status === 403
        ? "OpenAI rejected the API key. Check OPENAI_API_KEY."
        : res.status === 429
          ? "OpenAI is rate-limiting or out of credit. Try again in a minute."
          : "Transcription service error. Try again.",
    );
  }

  const data = (await res.json()) as { text?: string };
  return (data.text ?? "").trim();
}
