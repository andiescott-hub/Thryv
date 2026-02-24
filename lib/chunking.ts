/**
 * Document chunking module.
 * Splits PDF, spreadsheet, and plain-text files into overlapping text chunks
 * that are suitable for vector embedding and retrieval.
 *
 * Settings (per spec):
 *   Chunk size  : 950 characters (centre of 900-1000 range)
 *   Overlap     : 150 characters
 */

import fs from 'fs';
import path from 'path';

export interface Chunk {
  id: string;          // unique identifier for Chroma
  text: string;        // chunk content
  filename: string;    // source file name
  page: number;        // page / sheet index (1-based)
  chunkIndex: number;  // position of this chunk within the document
}

const CHUNK_SIZE = 950;
const OVERLAP = 150;

// ---------------------------------------------------------------------------
// Core splitter
// ---------------------------------------------------------------------------

function splitText(
  text: string,
  filename: string,
  page: number,
  startChunkIndex: number,
): Chunk[] {
  const chunks: Chunk[] = [];
  let i = 0;
  let chunkIndex = startChunkIndex;

  while (i < text.length) {
    const end = Math.min(i + CHUNK_SIZE, text.length);
    const slice = text.slice(i, end).trim();

    // Skip chunks that are effectively empty or too short to be useful
    if (slice.length >= 40) {
      chunks.push({
        id: `${filename}::p${page}::c${chunkIndex}`,
        text: slice,
        filename,
        page,
        chunkIndex: chunkIndex++,
      });
    }

    if (end === text.length) break;
    i = end - OVERLAP;
  }

  return chunks;
}

// ---------------------------------------------------------------------------
// PDF parser (page-aware)
// ---------------------------------------------------------------------------

async function chunkPDF(filePath: string): Promise<Chunk[]> {
  // Lazy import to avoid bundling on the client
  const pdfParse = (await import('pdf-parse')).default;
  const buffer = fs.readFileSync(filePath);
  const filename = path.basename(filePath);
  const allChunks: Chunk[] = [];
  let globalChunkIndex = 0;

  // Collect per-page text using the pagerender callback.
  // We also capture the parsed data to get numpages so we can validate
  // that the callback was invoked for EVERY page (some pdf-parse versions
  // only fire for page 1, leaving pageTexts with length 1 instead of 0,
  // which previously bypassed the fallback entirely).
  const pageTexts: string[] = [];
  let parsedData: any = null;

  try {
    parsedData = await pdfParse(buffer, {
      max: 0, // 0 = process ALL pages (explicit, never rely on default)
      pagerender: (pageData: any) =>
        pageData
          .getTextContent()
          .then((tc: any) => {
            const pageText = tc.items
              .map((item: any) => item.str)
              .join(' ')
              .replace(/\s+/g, ' ')
              .trim();
            pageTexts.push(pageText);
            return pageText;
          })
          .catch(() => {
            // Keep pageTexts in sync even when a single page fails
            pageTexts.push('');
            return '';
          }),
    });
  } catch {
    // pagerender pass failed entirely – fall through to bulk parse
  }

  const totalPages: number = parsedData?.numpages ?? 0;

  // Only use per-page results when the callback fired for every page.
  // If pageTexts.length < totalPages some pages were silently skipped.
  if (pageTexts.length > 0 && (totalPages === 0 || pageTexts.length >= totalPages)) {
    pageTexts.forEach((text, idx) => {
      const pageChunks = splitText(text, filename, idx + 1, globalChunkIndex);
      globalChunkIndex += pageChunks.length;
      allChunks.push(...pageChunks);
    });
    return allChunks;
  }

  // Fallback: bulk-text parse with character-position page estimation.
  // Re-use the already-parsed data when available to avoid a second I/O round.
  let bulkData: any;
  try {
    bulkData = parsedData ?? (await pdfParse(buffer, { max: 0 }));
  } catch {
    return allChunks;
  }

  const fullText: string = bulkData?.text ?? '';
  if (fullText.length === 0) return allChunks;

  const pages = Math.max(bulkData?.numpages ?? 1, 1);
  const estCharsPerPage = fullText.length / pages;

  let i = 0;
  while (i < fullText.length) {
    const end = Math.min(i + CHUNK_SIZE, fullText.length);
    const slice = fullText.slice(i, end).trim();
    if (slice.length >= 40) {
      const page = Math.max(
        1,
        Math.ceil((i + CHUNK_SIZE / 2) / estCharsPerPage),
      );
      allChunks.push({
        id: `${filename}::p${page}::c${globalChunkIndex}`,
        text: slice,
        filename,
        page,
        chunkIndex: globalChunkIndex++,
      });
    }
    if (end === fullText.length) break;
    i = end - OVERLAP;
  }

  return allChunks;
}

// ---------------------------------------------------------------------------
// Spreadsheet parser (Excel / CSV)
// ---------------------------------------------------------------------------

function chunkSpreadsheet(filePath: string): Chunk[] {
  const XLSX = require('xlsx') as typeof import('xlsx');
  const workbook = XLSX.readFile(filePath);
  const filename = path.basename(filePath);
  const allChunks: Chunk[] = [];
  let globalChunkIndex = 0;

  workbook.SheetNames.forEach((sheetName, sheetIdx) => {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 });

    // Batch rows into text blocks; overlap by 5 rows for context continuity
    const ROWS_PER_BLOCK = 25;
    const ROW_OVERLAP = 5;

    for (let i = 0; i < rows.length; i += ROWS_PER_BLOCK - ROW_OVERLAP) {
      const batch = rows.slice(i, i + ROWS_PER_BLOCK);
      const text =
        `Sheet: ${sheetName}\n` +
        batch
          .filter((row) => row.some((cell) => cell !== null && cell !== undefined && String(cell).trim() !== ''))
          .map((row) => row.map((cell) => String(cell ?? '')).join('\t'))
          .join('\n');

      if (text.trim().length < 40) continue;

      const chunks = splitText(
        text.slice(0, CHUNK_SIZE * 2), // guard against huge rows
        filename,
        sheetIdx + 1,
        globalChunkIndex,
      );
      globalChunkIndex += chunks.length;
      allChunks.push(...chunks);

      if (i + ROWS_PER_BLOCK >= rows.length) break;
    }
  });

  return allChunks;
}

// ---------------------------------------------------------------------------
// Plain-text parser
// ---------------------------------------------------------------------------

function chunkPlainText(filePath: string): Chunk[] {
  const text = fs.readFileSync(filePath, 'utf-8');
  const filename = path.basename(filePath);
  return splitText(text, filename, 1, 0);
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export async function chunkFile(filePath: string): Promise<Chunk[]> {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === '.pdf') {
    return chunkPDF(filePath);
  }

  if (['.xlsx', '.xls', '.csv'].includes(ext)) {
    return chunkSpreadsheet(filePath);
  }

  return chunkPlainText(filePath);
}
