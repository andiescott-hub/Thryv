/**
 * Embedding abstraction layer.
 *
 * Supports two providers, selected via EMBEDDING_PROVIDER env var:
 *   "ollama"  – local Ollama REST API  (default for dev)
 *   "openai"  – any OpenAI-compatible embedding endpoint (for production)
 *
 * Environment variables:
 *   EMBEDDING_PROVIDER   = "ollama" | "openai"   (default: "ollama")
 *   OLLAMA_URL           = http://localhost:11434  (Ollama base URL)
 *   EMBEDDING_MODEL      = nomic-embed-text        (model name)
 *   OPENAI_API_KEY       = sk-...                  (for openai provider)
 *   OPENAI_BASE_URL      = https://api.openai.com/v1 (override for other providers)
 */

const PROVIDER = (process.env.EMBEDDING_PROVIDER ?? 'ollama').toLowerCase();
const MODEL = process.env.EMBEDDING_MODEL ?? 'nomic-embed-text';

// ---------------------------------------------------------------------------
// Ollama provider
// ---------------------------------------------------------------------------

async function embedWithOllama(text: string): Promise<number[]> {
  const base = (process.env.OLLAMA_URL ?? 'http://localhost:11434').replace(/\/$/, '');
  const res = await fetch(`${base}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, prompt: text }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Ollama embedding error ${res.status}: ${body}`);
  }

  const json = (await res.json()) as { embedding: number[] };
  return json.embedding;
}

// ---------------------------------------------------------------------------
// OpenAI-compatible provider
// ---------------------------------------------------------------------------

async function embedWithOpenAI(text: string): Promise<number[]> {
  const { OpenAI } = await import('openai');

  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY ?? '',
    baseURL: process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1',
  });

  const response = await client.embeddings.create({
    model: MODEL,
    input: text,
  });

  return response.data[0].embedding;
}

// ---------------------------------------------------------------------------
// Batch helper (sequential with small delay to be kind to rate limits)
// ---------------------------------------------------------------------------

export async function getEmbedding(text: string): Promise<number[]> {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (PROVIDER === 'openai') return embedWithOpenAI(clean);
  return embedWithOllama(clean);
}

export async function getEmbeddingsBatch(
  texts: string[],
  onProgress?: (done: number, total: number) => void,
): Promise<number[][]> {
  const results: number[][] = [];
  for (let i = 0; i < texts.length; i++) {
    results.push(await getEmbedding(texts[i]));
    onProgress?.(i + 1, texts.length);
    // Small pause between calls to respect provider rate limits
    if (i < texts.length - 1) await new Promise((r) => setTimeout(r, 50));
  }
  return results;
}
