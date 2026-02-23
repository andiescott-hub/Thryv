/**
 * Chroma vector store abstraction.
 *
 * Connects to a running Chroma HTTP server. In development, run:
 *   docker run -p 8000:8000 chromadb/chroma
 * or:
 *   pip install chromadb && chroma run
 *
 * For production (Vercel), point CHROMA_URL at a hosted Chroma instance
 * (e.g. Chroma Cloud, Railway, Fly.io, etc.).
 *
 * Environment variables:
 *   CHROMA_URL         = http://localhost:8000
 *   CHROMA_COLLECTION  = documents  (default)
 */

import type { Chunk } from './chunking';

const CHROMA_URL = process.env.CHROMA_URL ?? 'http://localhost:8000';
const COLLECTION_NAME = process.env.CHROMA_COLLECTION ?? 'documents';

export interface RetrievedChunk {
  text: string;
  filename: string;
  page: number;
  chunkIndex: number;
  distance: number;
}

// ---------------------------------------------------------------------------
// Singleton collection handle (re-used across warm Lambda invocations)
// ---------------------------------------------------------------------------

let _collectionCache: import('chromadb').Collection | null = null;

async function getCollection(): Promise<import('chromadb').Collection> {
  if (_collectionCache) return _collectionCache;

  const { ChromaClient } = await import('chromadb');
  const client = new ChromaClient({ path: CHROMA_URL });

  _collectionCache = await client.getOrCreateCollection({
    name: COLLECTION_NAME,
    metadata: { 'hnsw:space': 'cosine' },
  });

  return _collectionCache;
}

// ---------------------------------------------------------------------------
// Write helpers (used by the ingestion script)
// ---------------------------------------------------------------------------

/**
 * Add a batch of chunks with their pre-computed embeddings to Chroma.
 * Idempotent – duplicate IDs are skipped by Chroma.
 */
export async function addChunks(
  chunks: Chunk[],
  embeddings: number[][],
): Promise<void> {
  if (chunks.length === 0) return;

  const collection = await getCollection();

  await collection.add({
    ids: chunks.map((c) => c.id),
    embeddings,
    documents: chunks.map((c) => c.text),
    metadatas: chunks.map((c) => ({
      filename: c.filename,
      page: c.page,
      chunkIndex: c.chunkIndex,
    })),
  });
}

/**
 * Delete all chunks belonging to a specific source file.
 * Useful for re-ingesting updated documents.
 */
export async function deleteByFilename(filename: string): Promise<void> {
  const collection = await getCollection();
  await collection.delete({ where: { filename } });
}

/**
 * Return the total number of chunks stored in the collection.
 */
export async function countChunks(): Promise<number> {
  const collection = await getCollection();
  return collection.count();
}

// ---------------------------------------------------------------------------
// Query helper (used by the API route)
// ---------------------------------------------------------------------------

/**
 * Query the collection for the top-k chunks most similar to the query embedding.
 */
export async function queryCollection(
  queryEmbedding: number[],
  topK = 6,
): Promise<RetrievedChunk[]> {
  const collection = await getCollection();

  const results = await collection.query({
    queryEmbeddings: [queryEmbedding],
    nResults: topK,
    include: ['documents', 'metadatas', 'distances'] as any,
  });

  const documents = results.documents?.[0] ?? [];
  const metadatas = results.metadatas?.[0] ?? [];
  const distances = results.distances?.[0] ?? [];

  return documents.map((doc, i) => ({
    text: doc ?? '',
    filename: (metadatas[i] as any)?.filename ?? 'unknown',
    page: Number((metadatas[i] as any)?.page ?? 1),
    chunkIndex: Number((metadatas[i] as any)?.chunkIndex ?? i),
    distance: distances[i] ?? 1,
  }));
}
