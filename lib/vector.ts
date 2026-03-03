/**
 * Pinecone vector store abstraction.
 *
 * Environment variables:
 *   PINECONE_API_KEY   – Your Pinecone API key
 *   PINECONE_INDEX     – Name of the Pinecone index (default: "documents")
 */

import { Pinecone } from '@pinecone-database/pinecone';
import type { Chunk } from './chunking';

const PINECONE_API_KEY = process.env.PINECONE_API_KEY ?? '';
const INDEX_NAME = process.env.PINECONE_INDEX ?? 'documents';

export interface RetrievedChunk {
  text: string;
  filename: string;
  page: number;
  chunkIndex: number;
  distance: number;
}

// ---------------------------------------------------------------------------
// Singleton index handle (re-used across warm Lambda invocations)
// ---------------------------------------------------------------------------

let _indexCache: ReturnType<Pinecone['index']> | null = null;

function getIndex() {
  if (_indexCache) return _indexCache;

  const pc = new Pinecone({ apiKey: PINECONE_API_KEY });
  _indexCache = pc.index({ name: INDEX_NAME });
  return _indexCache;
}

// ---------------------------------------------------------------------------
// Write helpers (used by the ingestion script)
// ---------------------------------------------------------------------------

/**
 * Add a batch of chunks with their pre-computed embeddings to Pinecone.
 * Upserts in batches of 100 (Pinecone's recommended batch size).
 */
export async function addChunks(
  chunks: Chunk[],
  embeddings: number[][],
): Promise<void> {
  if (chunks.length === 0) return;

  const index = getIndex();
  const BATCH_SIZE = 100;

  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);
    const batchEmbeddings = embeddings.slice(i, i + BATCH_SIZE);

    const records = batch.map((c, j) => ({
      id: c.id,
      values: batchEmbeddings[j],
      metadata: {
        text: c.text,
        filename: c.filename,
        page: c.page,
        chunkIndex: c.chunkIndex,
      },
    }));

    await index.upsert({ records });
  }
}

/**
 * Delete all chunks belonging to a specific source file.
 */
export async function deleteByFilename(filename: string): Promise<void> {
  const index = getIndex();
  await index.deleteMany({ filter: { filename: { $eq: filename } } });
}

/**
 * Return the total number of chunks stored in the index.
 */
export async function countChunks(): Promise<number> {
  const index = getIndex();
  const stats = await index.describeIndexStats();
  return stats.totalRecordCount ?? 0;
}

// ---------------------------------------------------------------------------
// Query helper (used by the API route)
// ---------------------------------------------------------------------------

/**
 * Query the index for the top-k chunks most similar to the query embedding.
 * Pinecone returns scores in [0, 1] for cosine similarity (higher = more similar).
 * We convert to distance (1 - score) to keep the same interface as before.
 */
export async function queryCollection(
  queryEmbedding: number[],
  topK = 6,
): Promise<RetrievedChunk[]> {
  const index = getIndex();

  const results = await index.query({
    vector: queryEmbedding,
    topK,
    includeMetadata: true,
  });

  return (results.matches ?? []).map((match) => ({
    text: (match.metadata?.text as string) ?? '',
    filename: (match.metadata?.filename as string) ?? 'unknown',
    page: Number(match.metadata?.page ?? 1),
    chunkIndex: Number(match.metadata?.chunkIndex ?? 0),
    distance: 1 - (match.score ?? 0),
  }));
}

/**
 * Delete the entire index contents. Used by ingest --clear.
 */
export async function clearIndex(): Promise<void> {
  const index = getIndex();
  await index.deleteAll();
}
