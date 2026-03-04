/**
 * POST /api/query
 *
 * Request body:
 *   { "question": "string (1-1000 chars)" }
 *
 * Response body (200):
 *   {
 *     "answer": "string",
 *     "citations": [{ "id": 1, "filename": "...", "page": 1, "excerpt": "..." }]
 *   }
 *
 * Error responses:
 *   400 – bad input
 *   429 – rate limit exceeded
 *   500 – upstream error (details logged server-side only)
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { getEmbedding } from '@/lib/embeddings';
import { queryCollection } from '@/lib/vector';
import { generateAnswer } from '@/lib/llm';

const TOP_K = 15;
const DISTANCE_THRESHOLD = 0.75; // cosine distance; lower = more similar (0–2 range)
const MIN_CHUNKS = 3;            // always keep at least this many chunks
const MAX_QUESTION_LENGTH = 1000;

export async function POST(request: NextRequest) {
  // -------------------------------------------------------------------------
  // 1. Rate limiting
  // -------------------------------------------------------------------------
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    request.headers.get('x-real-ip') ??
    'unknown';

  const { allowed, remaining, resetAt } = checkRateLimit(ip);

  const rateLimitHeaders = {
    'X-RateLimit-Limit': String(process.env.RATE_LIMIT_MAX ?? '20'),
    'X-RateLimit-Remaining': String(remaining),
    'X-RateLimit-Reset': String(Math.ceil(resetAt / 1000)),
  };

  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait before trying again.' },
      { status: 429, headers: rateLimitHeaders },
    );
  }

  // -------------------------------------------------------------------------
  // 2. Input validation
  // -------------------------------------------------------------------------
  let question: string;

  try {
    const body = await request.json();
    question = body?.question;
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body.' },
      { status: 400, headers: rateLimitHeaders },
    );
  }

  if (
    typeof question !== 'string' ||
    question.trim().length === 0 ||
    question.length > MAX_QUESTION_LENGTH
  ) {
    return NextResponse.json(
      {
        error: `"question" must be a non-empty string up to ${MAX_QUESTION_LENGTH} characters.`,
      },
      { status: 400, headers: rateLimitHeaders },
    );
  }

  question = question.trim();

  // -------------------------------------------------------------------------
  // 3. Embed the question
  // -------------------------------------------------------------------------
  let queryEmbedding: number[];
  try {
    queryEmbedding = await getEmbedding(question);
  } catch (err) {
    console.error('[/api/query] Embedding error:', err);
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `Embedding failed (provider=${process.env.EMBEDDING_PROVIDER ?? 'NOT SET'}): ${detail}` },
      { status: 500, headers: rateLimitHeaders },
    );
  }

  // -------------------------------------------------------------------------
  // 4. Vector retrieval
  // -------------------------------------------------------------------------
  let chunks;
  try {
    chunks = await queryCollection(queryEmbedding, TOP_K);
  } catch (err) {
    console.error('[/api/query] Vector retrieval error:', err);
    return NextResponse.json(
      { error: 'Failed to retrieve context from vector store. Check PINECONE_API_KEY config.' },
      { status: 500, headers: rateLimitHeaders },
    );
  }

  if (chunks.length === 0) {
    return NextResponse.json(
      {
        answer:
          'No documents have been indexed yet. Please run the ingestion script first.',
        citations: [],
      },
      { status: 200, headers: rateLimitHeaders },
    );
  }

  // Filter out low-relevance chunks but always keep at least MIN_CHUNKS
  const relevant = chunks.filter((c) => c.distance <= DISTANCE_THRESHOLD);
  chunks = relevant.length >= MIN_CHUNKS ? relevant : chunks.slice(0, MIN_CHUNKS);

  // -------------------------------------------------------------------------
  // 5. LLM answer generation
  // -------------------------------------------------------------------------
  let result;
  try {
    result = await generateAnswer(question, chunks);
  } catch (err) {
    console.error('[/api/query] LLM error:', err);
    return NextResponse.json(
      { error: 'Failed to generate answer from LLM. Check LLM_API_KEY config.' },
      { status: 500, headers: rateLimitHeaders },
    );
  }

  // -------------------------------------------------------------------------
  // 6. Return structured response
  // -------------------------------------------------------------------------
  return NextResponse.json(
    { answer: result.answer, citations: result.citations },
    { status: 200, headers: rateLimitHeaders },
  );
}

// Only POST is allowed
export async function GET() {
  return NextResponse.json({ error: 'Method not allowed.' }, { status: 405 });
}
