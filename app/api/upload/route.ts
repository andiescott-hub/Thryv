/**
 * POST /api/upload
 *
 * Accepts a file upload (multipart/form-data), chunks it, generates embeddings,
 * and stores the vectors in Pinecone. Allows users to ingest documents directly
 * from the browser without needing the CLI ingest script.
 *
 * Supported file types: .pdf, .xlsx, .xls, .csv, .txt, .md
 * Max file size: ~4.5 MB (Vercel serverless limit)
 */

import { NextRequest, NextResponse } from 'next/server';
import { writeFileSync, unlinkSync, mkdirSync } from 'fs';
import { join, extname } from 'path';
import { tmpdir } from 'os';
import { chunkFile } from '@/lib/chunking';
import { getEmbeddingsBatch } from '@/lib/embeddings';
import { addChunks, deleteByFilename } from '@/lib/vector';

const SUPPORTED_EXTENSIONS = new Set(['.pdf', '.xlsx', '.xls', '.csv', '.txt', '.md', '.docx', '.pptx']);
const MAX_FILE_SIZE = 4.5 * 1024 * 1024; // 4.5 MB

export async function POST(request: NextRequest) {
  let tmpPath: string | null = null;

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided.' }, { status: 400 });
    }

    const ext = extname(file.name).toLowerCase();
    if (!SUPPORTED_EXTENSIONS.has(ext)) {
      return NextResponse.json(
        { error: `Unsupported file type: ${ext}. Supported: ${[...SUPPORTED_EXTENSIONS].join(', ')}` },
        { status: 400 },
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File too large. Maximum size is ${Math.round(MAX_FILE_SIZE / 1024 / 1024)}MB.` },
        { status: 400 },
      );
    }

    // Write to /tmp so the existing chunkFile function can read it
    const tmpDir = join(tmpdir(), 'thryv-uploads');
    mkdirSync(tmpDir, { recursive: true });
    tmpPath = join(tmpDir, file.name);
    const buffer = Buffer.from(await file.arrayBuffer());
    writeFileSync(tmpPath, buffer);

    // Chunk
    const chunks = await chunkFile(tmpPath);
    if (chunks.length === 0) {
      return NextResponse.json(
        { error: 'No content could be extracted from the file.' },
        { status: 400 },
      );
    }

    // Embed
    const embeddings = await getEmbeddingsBatch(chunks.map((c) => c.text));

    // Store in Pinecone (delete old version first for idempotent re-uploads)
    await deleteByFilename(file.name);
    await addChunks(chunks, embeddings);

    return NextResponse.json({
      success: true,
      filename: file.name,
      chunks: chunks.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[/api/upload] Error:', message, err);
    return NextResponse.json(
      { error: `Failed to process file: ${message}` },
      { status: 500 },
    );
  } finally {
    // Clean up temp file
    if (tmpPath) {
      try { unlinkSync(tmpPath); } catch {}
    }
  }
}
