// Minimal client for the local LM Studio server (OpenAI-compatible).
// Default model: Gemma 4 26B, which won the Turkish subtitle comparison
// for the English corpus.
const BASE = process.env.LMSTUDIO_URL ?? 'http://localhost:1234/v1';
export const MODEL = process.env.LMSTUDIO_MODEL ?? 'gemma-4-26b-a4b-it-mlx';

interface ChatOptions {
  /** JSON schema the reply must follow (LM Studio enforces it strictly). */
  schema?: object;
  maxTokens?: number;
  temperature?: number;
}

/** One chat turn; null after three failed attempts. */
export async function chat(system: string, user: string, opts: ChatOptions = {}): Promise<string | null> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(`${BASE}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          temperature: opts.temperature ?? 0,
          max_tokens: opts.maxTokens ?? 400,
          ...(opts.schema && {
            response_format: { type: 'json_schema', json_schema: { name: 'reply', strict: true, schema: opts.schema } },
          }),
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const j = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      let out = (j.choices?.[0]?.message?.content ?? '').trim();
      if (out.includes('</think>')) out = out.split('</think>').pop()!.trim();
      return out || null;
    } catch (e) {
      if (attempt === 3) {
        console.warn(`  LM Studio: ${(e as Error).message}`);
        return null;
      }
      await new Promise(r => setTimeout(r, 500 * 2 ** attempt));
    }
  }
  return null;
}

export async function chatJson<T>(system: string, user: string, schema: object, maxTokens = 600,
                                  temperature = 0): Promise<T | null> {
  const raw = await chat(system, user, { schema, maxTokens, temperature });
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
