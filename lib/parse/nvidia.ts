// NVIDIA API (OpenAI-compatible) client for menu extraction.
// Server-side only by usage; deliberately does not import "server-only" so the
// CLI script (scripts/try-parse.ts) can use it.

const ENDPOINT = "https://integrate.api.nvidia.com/v1/chat/completions";
// Reasoning models at high effort can need several minutes per page.
const REQUEST_TIMEOUT_MS = Number(process.env.NVIDIA_TIMEOUT_MS) || 120_000;

export const SYSTEM_PROMPT = `You are a precise restaurant-menu transcription engine.
You read menu images (photos, scans, rendered PDF pages, screenshots) and optional extracted text, and you output the menu as structured JSON.

Rules:
- Extract EVERY category and EVERY item you can see. Do not skip, summarize or invent items.
- Keep names and descriptions in the ORIGINAL language and script exactly as printed (Arabic stays Arabic, English stays English). Do not translate. If an item shows both an Arabic and an English name, use the form "English / عربي".
- Prices are in Egyptian pounds (EGP). Output prices as plain numbers (e.g. 150 or 42.5) with no currency symbol or text. Convert Arabic-Indic digits (٠١٢٣٤٥٦٧٨٩) to Western digits.
- If an item has several sizes/options with different prices (e.g. Single/Double, S/M/L, صغير/وسط/كبير, Quarter/Half/Full), put them in "variants" as {"name","price"}, and set "price" to the first variant's price.
- If a price column header (e.g. "S M L", or "طبق" / "ساندوتش") applies to many items, use those headers as variant names.
- A dash ("-", "–") or empty cell in a price column means that option is NOT available for that item: leave that variant out. If only one option remains, still output it as the single variant.
- If an item has no visible price, set "price" to 0.
- "description" is optional: include it only when the menu prints one (ingredients, notes). Otherwise omit it.
- If items appear without a category heading, put them in a category named "Menu".
- Ignore phone numbers, addresses, logos, delivery info, and decorative text.
- If the image is not a menu or is unreadable, return {"categories": []}.

Output ONLY a single JSON object, no markdown, no code fences, no commentary, with exactly this shape:
{"categories":[{"name":"string","items":[{"name":"string","description":"string (optional)","price":number,"variants":[{"name":"string","price":number}]}]}]}
"variants" is optional; omit it when the item has a single price.`;

export interface ModelRequest {
  /** data: URLs (e.g. "data:image/jpeg;base64,...") */
  images: string[];
  /** Extra text context (PDF text layer or HTML visible text). */
  text?: string;
  /** Extra instruction appended to the user message (used on retry). */
  extraInstruction?: string;
}

function getConfig(): { apiKey: string; model: string; reasoningEffort?: string } {
  const apiKey = process.env.NVIDIA_API_KEY;
  const model = process.env.NVIDIA_MODEL;
  if (!apiKey) throw new Error("NVIDIA_API_KEY is not set");
  if (!model) throw new Error("NVIDIA_MODEL is not set");
  // Optional, for reasoning models (e.g. Mistral Large 4): "low" keeps them fast.
  const reasoningEffort = process.env.NVIDIA_REASONING_EFFORT?.trim() || undefined;
  return { apiKey, model, reasoningEffort };
}

type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

function buildUserContent(req: ModelRequest): ContentPart[] {
  const parts: ContentPart[] = [];
  let instruction =
    req.images.length > 0
      ? "Transcribe the menu in this image into the JSON format described. Return JSON only."
      : "Transcribe the menu in the following text into the JSON format described. Return JSON only.";
  if (req.text && req.text.trim()) {
    instruction +=
      (req.images.length > 0
        ? "\n\nText extracted from the same page (may be incomplete or out of order; prefer the image when they disagree):\n"
        : "\n\nMenu text:\n") + req.text.trim().slice(0, 30_000);
  }
  if (req.extraInstruction) instruction += `\n\n${req.extraInstruction}`;
  parts.push({ type: "text", text: instruction });
  for (const url of req.images) {
    parts.push({ type: "image_url", image_url: { url } });
  }
  return parts;
}

interface ChatCompletionResponse {
  choices?: { message?: { content?: string | null } }[];
  error?: { message?: string } | string;
}

/** Calls the model and returns the raw text content of the first choice. */
export async function callMenuModel(req: ModelRequest): Promise<string> {
  const { apiKey, model, reasoningEffort } = getConfig();
  const body = {
    model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildUserContent(req) },
    ],
    temperature: 0.1,
    top_p: 0.9,
    max_tokens: reasoningEffort ? 32768 : 8192,
    // Streamed so long-thinking models send bytes right away; Node's fetch
    // otherwise gives up after 300 s without response headers.
    stream: true,
    ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    let res: Response;
    try {
      res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      if (controller.signal.aborted) throw new Error("NVIDIA API request timed out");
      throw new Error(`NVIDIA API request failed: ${(err as Error).message}`);
    }

    if (!res.ok) {
      const raw = await res.text();
      throw new Error(`NVIDIA API error ${res.status}: ${raw.slice(0, 500)}`);
    }

    let content: string;
    try {
      content = (res.headers.get("content-type") ?? "").includes("text/event-stream")
        ? await readStream(res)
        : readJson(await res.text());
    } catch (err) {
      if (controller.signal.aborted) throw new Error("NVIDIA API request timed out");
      throw err;
    }
    if (!content.trim()) throw new Error("NVIDIA API returned an empty response");
    return content;
  } finally {
    clearTimeout(timer);
  }
}

/** Concatenates delta.content from an OpenAI-style SSE stream (reasoning tokens are skipped). */
async function readStream(res: Response): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  let content = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let nl: number;
    while ((nl = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") return content;
      let chunk: { choices?: { delta?: { content?: string | null } }[]; error?: unknown };
      try {
        chunk = JSON.parse(data);
      } catch {
        continue;
      }
      if (chunk.error) throw new Error(`NVIDIA API stream error: ${JSON.stringify(chunk.error).slice(0, 300)}`);
      content += chunk.choices?.[0]?.delta?.content ?? "";
    }
  }
  return content;
}

function readJson(raw: string): string {
  let data: ChatCompletionResponse;
  try {
    data = JSON.parse(raw) as ChatCompletionResponse;
  } catch {
    throw new Error("NVIDIA API returned a non-JSON response");
  }
  const content = data.choices?.[0]?.message?.content;
  return typeof content === "string" ? content : "";
}

/**
 * Pulls a JSON object out of model output: strips <think> blocks and ``` fences,
 * then takes the outermost {...}. Throws on invalid JSON.
 */
export function extractJson(text: string): unknown {
  let s = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("No JSON object in model output");
  return JSON.parse(s.slice(start, end + 1));
}
