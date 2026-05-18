/**
 * POST /api/upload-text
 *
 * Accepts pasted text (JSON `{ text, title? }`), derives a topic name via the
 * LLM when no title is given, chunks the text, embeds it, and stores the
 * vectors in Pinecone alongside file uploads.
 */

import { NextRequest, NextResponse } from 'next/server';
import { chunkText } from '@/lib/chunking';
import { getEmbeddingsBatch } from '@/lib/embeddings';
import { addChunks, deleteByFilename } from '@/lib/vector';
import { deriveTopicFromText } from '@/lib/llm';

const MAX_TEXT_LENGTH = 200_000; // ~200 KB of UTF-8 text
const MIN_TEXT_LENGTH = 40;

// Strip unpaired UTF-16 surrogates. Two sources of these in pasted text:
//   1. The user copied a truncated snippet that lost half of an emoji.
//   2. The chunker sliced a properly-paired emoji at a 950-char boundary.
// Pinecone's JSON encoder rejects unpaired surrogates with "Missing low
// surrogate" / "Missing high surrogate".
function stripUnpairedSurrogates(s: string): string {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if (code >= 0xD800 && code <= 0xDBFF) {
      const next = s.charCodeAt(i + 1);
      if (next >= 0xDC00 && next <= 0xDFFF) {
        out += s[i] + s[i + 1];
        i++;
      }
    } else if (code >= 0xDC00 && code <= 0xDFFF) {
      // lone low surrogate — drop
    } else {
      out += s[i];
    }
  }
  return out;
}

function sanitizeForFilename(raw: string): string {
  return raw
    .replace(/[\\/:*?"<>|\n\r\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
}

function fallbackTopic(text: string): string {
  const firstLine = text.split(/\n/).find((l) => l.trim().length > 0) ?? '';
  const cleaned = sanitizeForFilename(firstLine);
  return cleaned || 'Pasted Text';
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { text?: string; title?: string };
    const text = typeof body.text === 'string' ? stripUnpairedSurrogates(body.text) : '';
    const providedTitle = typeof body.title === 'string' ? stripUnpairedSurrogates(body.title) : '';

    if (text.trim().length < MIN_TEXT_LENGTH) {
      return NextResponse.json(
        { error: `Please paste at least ${MIN_TEXT_LENGTH} characters of text.` },
        { status: 400 },
      );
    }

    if (text.length > MAX_TEXT_LENGTH) {
      return NextResponse.json(
        { error: `Text too large. Maximum is ${Math.round(MAX_TEXT_LENGTH / 1000)} KB.` },
        { status: 400 },
      );
    }

    // Determine filename
    let topic = sanitizeForFilename(providedTitle);
    if (!topic) {
      topic = sanitizeForFilename(await deriveTopicFromText(text));
    }
    if (!topic) {
      topic = fallbackTopic(text);
    }
    const filename = `${topic}.txt`;

    // Chunk, then re-sanitize: the slice boundaries may have split a
    // properly-paired surrogate, leaving lone surrogates at chunk edges.
    const chunks = chunkText(text, filename).map((c) => ({
      ...c,
      text: stripUnpairedSurrogates(c.text),
    }));
    if (chunks.length === 0) {
      return NextResponse.json(
        { error: 'No content could be extracted from the pasted text.' },
        { status: 400 },
      );
    }

    // Embed
    const embeddings = await getEmbeddingsBatch(chunks.map((c) => c.text));

    // Best-effort delete of any existing vectors for this filename before upserting
    try {
      await deleteByFilename(filename);
    } catch (deleteErr) {
      console.warn('[/api/upload-text] Could not delete existing vectors (proceeding with upsert):', deleteErr);
    }
    await addChunks(chunks, embeddings);

    return NextResponse.json({
      success: true,
      filename,
      chunks: chunks.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[/api/upload-text] Error:', message, err);
    return NextResponse.json(
      { error: `Failed to process text: ${message}` },
      { status: 500 },
    );
  }
}
