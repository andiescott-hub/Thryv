import { NextRequest, NextResponse } from 'next/server';
import { fetchChunksByFilename } from '@/lib/vector';

/**
 * GET /api/documents/preview?filename=<name>
 *
 * Returns all chunks for a document, grouped by page, for preview display.
 */
export async function GET(req: NextRequest) {
  const filename = req.nextUrl.searchParams.get('filename');

  if (!filename) {
    return NextResponse.json({ error: 'filename query param is required.' }, { status: 400 });
  }

  try {
    const chunks = await fetchChunksByFilename(filename);

    if (chunks.length === 0) {
      return NextResponse.json({ error: 'Document not found.' }, { status: 404 });
    }

    // Group chunks by page
    const pages: Record<number, string[]> = {};
    for (const chunk of chunks) {
      if (!pages[chunk.page]) pages[chunk.page] = [];
      pages[chunk.page].push(chunk.text);
    }

    // Build ordered page array
    const orderedPages = Object.keys(pages)
      .map(Number)
      .sort((a, b) => a - b)
      .map((pageNum) => ({
        page: pageNum,
        content: pages[pageNum].join(''),
      }));

    return NextResponse.json({ filename, pages: orderedPages });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch document preview.' }, { status: 500 });
  }
}
