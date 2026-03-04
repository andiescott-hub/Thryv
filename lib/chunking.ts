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

  // Collect per-page text using the pagerender callback
  const pageTexts: string[] = [];

  await pdfParse(buffer, {
    // pagerender is called once per page; the return value is the text for that page
    pagerender: (pageData: any) =>
      pageData.getTextContent().then((tc: any) => {
        const pageText = tc.items
          .map((item: any) => item.str)
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();
        pageTexts.push(pageText);
        return pageText;
      }),
  });

  // If pagerender produced no results fall back to bulk text
  if (pageTexts.length === 0) {
    const data = await pdfParse(buffer);
    const estCharsPerPage =
      data.text.length / Math.max(data.numpages ?? 1, 1);
    let i = 0;
    while (i < data.text.length) {
      const end = Math.min(i + CHUNK_SIZE, data.text.length);
      const slice = data.text.slice(i, end).trim();
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
      if (end === data.text.length) break;
      i = end - OVERLAP;
    }
    return allChunks;
  }

  // Page-by-page chunking
  pageTexts.forEach((text, idx) => {
    const pageChunks = splitText(text, filename, idx + 1, globalChunkIndex);
    globalChunkIndex += pageChunks.length;
    allChunks.push(...pageChunks);
  });

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
// DOCX parser (uses mammoth)
// ---------------------------------------------------------------------------

async function chunkDocx(filePath: string): Promise<Chunk[]> {
  const mammoth = (await import('mammoth')).default;
  const filename = path.basename(filePath);

  const result = await mammoth.extractRawText({ path: filePath });
  const text = result.value.replace(/\s+/g, ' ').trim();
  if (text.length < 40) return [];

  return splitText(text, filename, 1, 0);
}

// ---------------------------------------------------------------------------
// PPTX parser (uses adm-zip to extract text from slide XML)
// ---------------------------------------------------------------------------

async function chunkPptx(filePath: string): Promise<Chunk[]> {
  const AdmZip = (await import('adm-zip')).default;
  const filename = path.basename(filePath);
  const allChunks: Chunk[] = [];
  let globalChunkIndex = 0;

  const zip = new AdmZip(filePath);
  const entries = zip.getEntries();

  // Collect slide entries sorted by slide number
  const slideEntries = entries
    .filter((e) => /^ppt\/slides\/slide\d+\.xml$/.test(e.entryName))
    .sort((a, b) => {
      const numA = parseInt(a.entryName.match(/slide(\d+)/)?.[1] ?? '0');
      const numB = parseInt(b.entryName.match(/slide(\d+)/)?.[1] ?? '0');
      return numA - numB;
    });

  slideEntries.forEach((entry, idx) => {
    const xml = entry.getData().toString('utf-8');
    // Extract text from <a:t> tags (PowerPoint text elements)
    const textParts: string[] = [];
    const regex = /<a:t>([\s\S]*?)<\/a:t>/g;
    let match;
    while ((match = regex.exec(xml)) !== null) {
      textParts.push(match[1]);
    }

    const slideText = textParts.join(' ').replace(/\s+/g, ' ').trim();
    if (slideText.length < 40) return;

    const slideChunks = splitText(slideText, filename, idx + 1, globalChunkIndex);
    globalChunkIndex += slideChunks.length;
    allChunks.push(...slideChunks);
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

  if (ext === '.docx') {
    return chunkDocx(filePath);
  }

  if (ext === '.pptx') {
    return chunkPptx(filePath);
  }

  return chunkPlainText(filePath);
}
