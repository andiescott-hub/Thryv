/**
 * LLM abstraction layer – targets kimi-k2.5:cloud via the Moonshot AI API,
 * which is fully OpenAI-SDK-compatible.
 *
 * Environment variables:
 *   LLM_API_KEY    – Moonshot / provider API key  (required)
 *   LLM_BASE_URL   – API base URL                 (default: https://api.moonshot.cn/v1)
 *   LLM_MODEL      – Model identifier             (default: kimi-k2.5)
 *   LLM_MAX_TOKENS – Max output tokens            (default: 2048)
 */

import OpenAI from 'openai';
import type { RetrievedChunk } from './vector';

const BASE_URL = process.env.LLM_BASE_URL ?? 'https://api.moonshot.cn/v1';
const MODEL = process.env.LLM_MODEL ?? 'kimi-k2.5';
const MAX_TOKENS = Number(process.env.LLM_MAX_TOKENS ?? '2048');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Citation {
  id: number;
  filename: string;
  page: number;
  excerpt: string;
}

export interface LLMAnswer {
  answer: string;
  citations: Citation[];
}

// ---------------------------------------------------------------------------
// Prompt construction
// ---------------------------------------------------------------------------

function buildContextBlock(chunks: RetrievedChunk[]): string {
  return chunks
    .map(
      (c, i) =>
        `[${i + 1}] File: ${c.filename} | Page: ${c.page}\n${c.text}`,
    )
    .join('\n\n---\n\n');
}

const SYSTEM_PROMPT = `You are a knowledgeable assistant answering questions using only the retrieved document context provided by the user.

Rules:
- Base every claim strictly on the provided context. Do not invent or infer beyond what is written.
- Cite the source of each claim using the reference number shown in the context block, e.g. [1], [2].
- If the answer cannot be found in the context, respond exactly: "I could not find this information in the provided documents."
- For broad or summary questions (e.g. "what do I need to know", "summarise", "what's new", "key points", "overview"), cover ALL key points found across every context block — do not stop after the first match.
- For specific factual questions, be direct and precise.

Formatting – always structure your answer using markdown:
- Use ## for main section headings and ### for sub-headings wherever the answer covers distinct topics or categories.
- Use bullet lists (- item) for multiple related items, features, or options.
- Use **bold** to highlight key terms, product names, or important values.
- Prefer structured layout (headings → bullets) over long prose paragraphs.
- Even a short answer should use a heading if it addresses a named topic (e.g. ## Pricing, ## Booking, ## Integrations).

Output format – respond with a single JSON object (no markdown fences):
{
  "answer": "<your markdown-formatted answer with inline citation markers like [1]>",
  "usedRefs": [1, 2]
}`;

// ---------------------------------------------------------------------------
// LLM call + response parsing
// ---------------------------------------------------------------------------

export async function generateAnswer(
  question: string,
  chunks: RetrievedChunk[],
): Promise<LLMAnswer> {
  const client = new OpenAI({
    apiKey: process.env.LLM_API_KEY ?? '',
    baseURL: BASE_URL,
  });

  const contextBlock = buildContextBlock(chunks);

  const userMessage = `Context:\n${contextBlock}\n\nQuestion:\n${question}`;

  const response = await client.chat.completions.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    temperature: 0.1, // Low temperature for factual retrieval tasks
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userMessage },
    ],
  });

  const raw = response.choices[0]?.message?.content ?? '';

  // ---------------------------------------------------------------------------
  // Parse JSON response
  // ---------------------------------------------------------------------------
  let answer = raw;
  let usedRefs: number[] = [];

  try {
    // Strip any accidental markdown fences
    const jsonText = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
    const parsed = JSON.parse(jsonText) as { answer: string; usedRefs?: number[] };
    answer = parsed.answer ?? raw;
    usedRefs = parsed.usedRefs ?? [];
  } catch {
    // Fallback: use raw text and infer citations from [n] markers
    const matches = [...raw.matchAll(/\[(\d+)\]/g)];
    usedRefs = [...new Set(matches.map((m) => Number(m[1])))];
  }

  // Build structured citation objects from the chunks that were referenced
  const citations: Citation[] = usedRefs
    .filter((ref) => ref >= 1 && ref <= chunks.length)
    .map((ref) => {
      const chunk = chunks[ref - 1];
      return {
        id: ref,
        filename: chunk.filename,
        page: chunk.page,
        // Return a short excerpt (first 200 chars) as a preview
        excerpt: chunk.text.slice(0, 200).trim() + (chunk.text.length > 200 ? '…' : ''),
      };
    });

  return { answer, citations };
}
