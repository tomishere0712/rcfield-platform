import { DataSource } from 'typeorm';
import { GoogleGenAI } from '@google/genai';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse') as (buffer: Buffer) => Promise<{ text: string }>;
import * as mammoth from 'mammoth';
import { AppDataSource } from '../config/database';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { AppError, KbDocumentStatus } from '../types';
import { KbDocument } from '../models/kb-document.entity';
import { wsService } from './websocket.service';

const ai = new GoogleGenAI({ apiKey: env.ai.googleApiKey });

const CHUNK_SIZE = 2000;
const OVERLAP = 400;

const ALLOWED_MIMETYPES: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/msword': 'docx',
  'text/plain': 'txt',
  'text/markdown': 'md',
  'text/x-markdown': 'md',
};

// Splits text into overlapping chunks of ~500 tokens (≈2000 chars)
export function chunkText(text: string): string[] {
  const chunks: string[] = [];
  let i = 0;
  while (i < text.length) {
    chunks.push(text.slice(i, i + CHUNK_SIZE));
    i += CHUNK_SIZE - OVERLAP;
  }
  return chunks.filter((c) => c.trim().length > 50);
}

// Extracts plain text from uploaded file buffer based on mimetype
export async function parseFile(buffer: Buffer, mimetype: string): Promise<string> {
  const ext = ALLOWED_MIMETYPES[mimetype];
  if (!ext) {
    throw new AppError('Chỉ hỗ trợ PDF, DOCX, TXT, MD.', 422, 'UNSUPPORTED_FORMAT');
  }

  if (ext === 'pdf') {
    try {
      const result = await pdfParse(buffer);
      return result.text;
    } catch {
      throw new AppError(
        'Không thể đọc file PDF. File có thể bị mã hóa hoặc lỗi.',
        422,
        'PDF_PARSE_ERROR',
      );
    }
  }

  if (ext === 'docx') {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  // TXT / MD
  return buffer.toString('utf-8');
}

// Generates embedding vector for a text using Gemini text-embedding-004
export async function embedText(text: string): Promise<number[]> {
  const result = await ai.models.embedContent({
    model: env.ai.embeddingModel,
    contents: text,
  });
  return result.embeddings![0].values!;
}

// Inserts chunks with their embeddings into kb_chunks using raw SQL (TypeORM has no vector type)
async function bulkInsertChunks(
  ds: DataSource,
  cafeId: string,
  documentId: string,
  chunks: { text: string; index: number; embedding: number[] }[],
): Promise<void> {
  for (const chunk of chunks) {
    await ds.query(
      `INSERT INTO kb_chunks (cafe_id, document_id, chunk_text, chunk_index, embedding)
       VALUES ($1, $2, $3, $4, $5::vector)`,
      [cafeId, documentId, chunk.text, chunk.index, JSON.stringify(chunk.embedding)],
    );
  }
}

// Retrieves top-5 semantically similar chunks for cafeId using cosine similarity.
// Returns chunks annotated with document title and upload date so the LLM can prefer newer info.
export async function retrieveChunks(
  ds: DataSource,
  cafeId: string,
  queryEmbedding: number[],
): Promise<string[]> {
  const rows = await ds.query<{ chunk_text: string; title: string; created_at: Date }[]>(
    `SELECT c.chunk_text, d.title, d.created_at
     FROM kb_chunks c
     JOIN kb_documents d ON c.document_id = d.id
     WHERE c.cafe_id = $1 AND d.deleted_at IS NULL
     ORDER BY c.embedding <=> $2::vector
     LIMIT 5`,
    [cafeId, JSON.stringify(queryEmbedding)],
  );
  return rows.map((r) => {
    const date = new Date(r.created_at).toLocaleDateString('vi-VN');
    return `[Tài liệu: "${r.title}" - cập nhật ${date}]\n${r.chunk_text}`;
  });
}

// Full async pipeline: parse → chunk → embed → store → update status → push WS event
export async function processDocument(documentId: string): Promise<void> {
  const ds: DataSource = AppDataSource;
  const docRepo = ds.getRepository(KbDocument);

  const doc = await docRepo.findOne({ where: { id: documentId } });
  if (!doc) {
    logger.warn('KB', 'processDocument: document not found', { documentId });
    return;
  }

  try {
    const rawContent = doc.rawContent ?? '';
    if (!rawContent.trim()) {
      throw new AppError('Document has no text content', 422, 'NO_CONTENT');
    }

    const textChunks = chunkText(rawContent);
    logger.info('KB', 'chunked document', { documentId, chunkCount: textChunks.length });

    const chunksWithEmbeddings = await Promise.all(
      textChunks.map(async (text, index) => ({
        text,
        index,
        embedding: await embedText(text),
      })),
    );

    await bulkInsertChunks(ds, doc.cafeId, documentId, chunksWithEmbeddings);

    await docRepo.update(documentId, { status: KbDocumentStatus.INDEXED });
    logger.info('KB', 'document indexed', { documentId, chunkCount: textChunks.length });

    wsService.pushToUser(doc.createdBy, 'kb_document.status_changed', {
      documentId,
      status: KbDocumentStatus.INDEXED,
      chunkCount: textChunks.length,
    });
  } catch (err) {
    logger.error('KB', 'failed to process document', err);
    await docRepo.update(documentId, { status: KbDocumentStatus.FAILED });
    wsService.pushToUser(doc.createdBy, 'kb_document.status_changed', {
      documentId,
      status: KbDocumentStatus.FAILED,
    });
  }
}

export const kbService = {
  chunkText,
  parseFile,
  embedText,
  retrieveChunks,
  processDocument,
  allowedMimetypes: ALLOWED_MIMETYPES,
};
