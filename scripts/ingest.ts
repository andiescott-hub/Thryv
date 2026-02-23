/**
 * Document ingestion script.
 *
 * Reads every supported file from the /documents directory, chunks it,
 * embeds the chunks, and upserts them into the Chroma collection.
 *
 * Usage:
 *   npm run ingest
 *   # or
 *   npx tsx scripts/ingest.ts
 *
 * Optional flags:
 *   --clear           Delete the entire collection before ingesting
 *   --file <path>     Ingest a single file instead of the whole /documents dir
 *
 * Environment variables (same as the app – load from .env.local automatically):
 *   CHROMA_URL, CHROMA_COLLECTION
 *   EMBEDDING_PROVIDER, OLLAMA_URL, EMBEDDING_MODEL
 *   OPENAI_API_KEY, OPENAI_BASE_URL (if using openai provider)
 */

// Load .env.local before anything else
import { config as loadEnv } from 'node:process';
import { resolve, extname, basename } from 'node:path';
import { readdirSync, existsSync, statSync } from 'node:fs';

// Manually load .env.local since this script runs outside Next.js
try {
  const { config } = await import('dotenv');
  config({ path: resolve(process.cwd(), '.env.local') });
} catch {
  // dotenv not installed – rely on shell env
}

import { chunkFile, type Chunk } from '../lib/chunking.js';
import { getEmbeddingsBatch } from '../lib/embeddings.js';
import { addChunks, countChunks, deleteByFilename } from '../lib/vector.js';
import { ChromaClient } from 'chromadb';

const SUPPORTED_EXTENSIONS = new Set(['.pdf', '.xlsx', '.xls', '.csv', '.txt', '.md']);

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const shouldClear = args.includes('--clear');
const fileArgIdx = args.indexOf('--file');
const singleFile = fileArgIdx !== -1 ? args[fileArgIdx + 1] : null;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function log(msg: string) {
  console.log(`[ingest] ${msg}`);
}

function logError(msg: string, err?: unknown) {
  console.error(`[ingest] ERROR: ${msg}`, err ?? '');
}

async function clearCollection() {
  const { ChromaClient } = await import('chromadb');
  const client = new ChromaClient({
    path: process.env.CHROMA_URL ?? 'http://localhost:8000',
  });
  const name = process.env.CHROMA_COLLECTION ?? 'documents';
  try {
    await client.deleteCollection({ name });
    log(`Collection "${name}" deleted.`);
  } catch {
    log(`Collection "${name}" did not exist – skipping delete.`);
  }
}

async function ingestFile(filePath: string): Promise<{ chunks: number; skipped: boolean }> {
  const ext = extname(filePath).toLowerCase();
  if (!SUPPORTED_EXTENSIONS.has(ext)) {
    log(`Skipping unsupported file: ${basename(filePath)}`);
    return { chunks: 0, skipped: true };
  }

  const filename = basename(filePath);
  log(`Processing: ${filename}`);

  // Chunk the file
  let chunks: Chunk[];
  try {
    chunks = await chunkFile(filePath);
  } catch (err) {
    logError(`Failed to chunk ${filename}`, err);
    return { chunks: 0, skipped: true };
  }

  if (chunks.length === 0) {
    log(`  → No chunks produced (empty or unreadable). Skipping.`);
    return { chunks: 0, skipped: true };
  }

  log(`  → ${chunks.length} chunks extracted. Generating embeddings…`);

  // Embed
  let embeddings: number[][];
  try {
    embeddings = await getEmbeddingsBatch(
      chunks.map((c) => c.text),
      (done, total) => {
        if (done % 10 === 0 || done === total) {
          process.stdout.write(`\r  → Embedded ${done}/${total}`);
        }
      },
    );
    process.stdout.write('\n');
  } catch (err) {
    logError(`Failed to embed chunks for ${filename}`, err);
    return { chunks: 0, skipped: true };
  }

  // Upsert into Chroma (delete old version first to allow re-ingestion)
  try {
    await deleteByFilename(filename);
    await addChunks(chunks, embeddings);
  } catch (err) {
    logError(`Failed to write chunks to Chroma for ${filename}`, err);
    return { chunks: 0, skipped: true };
  }

  log(`  → Stored ${chunks.length} chunks for "${filename}".`);
  return { chunks: chunks.length, skipped: false };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('\n========================================');
  console.log('  Thryv RAG – Document Ingestion Script ');
  console.log('========================================\n');

  if (shouldClear) {
    log('--clear flag detected. Deleting existing collection…');
    await clearCollection();
  }

  // Determine files to process
  const filePaths: string[] = [];

  if (singleFile) {
    const abs = resolve(singleFile);
    if (!existsSync(abs)) {
      logError(`File not found: ${abs}`);
      process.exit(1);
    }
    filePaths.push(abs);
  } else {
    const docsDir = resolve(process.cwd(), 'documents');
    if (!existsSync(docsDir)) {
      logError(
        `Documents directory not found at ${docsDir}.\n` +
          'Create it and place your PDF / spreadsheet files inside, then re-run.',
      );
      process.exit(1);
    }

    const entries = readdirSync(docsDir);
    for (const entry of entries) {
      const full = resolve(docsDir, entry);
      if (statSync(full).isFile()) {
        filePaths.push(full);
      }
    }

    if (filePaths.length === 0) {
      log('No files found in /documents. Add PDFs or spreadsheets and re-run.');
      process.exit(0);
    }
  }

  log(`Found ${filePaths.length} file(s) to process.\n`);

  // Process each file
  let totalChunks = 0;
  let skippedFiles = 0;

  for (const fp of filePaths) {
    const result = await ingestFile(fp);
    totalChunks += result.chunks;
    if (result.skipped) skippedFiles++;
  }

  // Final summary
  const collectionTotal = await countChunks();
  console.log('\n────────────────────────────');
  log(`Files processed : ${filePaths.length - skippedFiles}`);
  log(`Files skipped   : ${skippedFiles}`);
  log(`New chunks added: ${totalChunks}`);
  log(`Collection total: ${collectionTotal} chunks`);
  console.log('────────────────────────────\n');
  log('Ingestion complete. The application is ready to query.\n');
}

main().catch((err) => {
  logError('Unhandled error', err);
  process.exit(1);
});
