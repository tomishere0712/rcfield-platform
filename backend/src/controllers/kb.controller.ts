import { Request, Response, NextFunction } from 'express';
import { AppDataSource } from '../config/database';
import { logger } from '../config/logger';
import { AppError, AuthRequest, KbContentType, KbDocumentStatus, UserRole } from '../types';
import { KbDocument } from '../models/kb-document.entity';
import { UploadDocumentSchema } from '../validate';
import { kbService } from '../services/kb.service';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// POST /api/v1/cafes/:cafeId/kb/documents  [auth]
export async function uploadDocument(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { cafeId } = req.params;
    const providerId = req.user!.userId;

    if (!req.file) {
      return next(new AppError('File là bắt buộc.', 400, 'FILE_REQUIRED'));
    }

    if (req.file.size > MAX_FILE_SIZE) {
      return next(new AppError('File không được vượt quá 10MB.', 422, 'FILE_TOO_LARGE'));
    }

    if (!kbService.allowedMimetypes[req.file.mimetype]) {
      return next(new AppError('Chỉ hỗ trợ PDF, DOCX, TXT, MD.', 422, 'UNSUPPORTED_FORMAT'));
    }

    const cafeRows = await AppDataSource.query<{ provider_id: string }[]>(
      `SELECT provider_id FROM cafes WHERE id = $1`,
      [cafeId],
    );
    if (!cafeRows.length) {
      return next(new AppError('Cafe không tồn tại.', 404, 'CAFE_NOT_FOUND'));
    }
    if (cafeRows[0].provider_id !== providerId && req.user!.role !== UserRole.ADMIN) {
      return next(
        new AppError('Bạn không có quyền quản lý KB của chi nhánh này.', 403, 'FORBIDDEN'),
      );
    }

    const body = UploadDocumentSchema.safeParse(req.body);
    if (!body.success) {
      return next(new AppError(body.error.errors[0].message, 400, 'VALIDATION_ERROR'));
    }

    const rawContent = await kbService.parseFile(req.file.buffer, req.file.mimetype);

    const docRepo = AppDataSource.getRepository(KbDocument);
    const doc = docRepo.create({
      cafeId,
      title: body.data.title,
      originalFilename: req.file.originalname,
      contentType: (body.data.content_type as KbContentType) ?? KbContentType.CUSTOM,
      rawContent,
      status: KbDocumentStatus.PENDING,
      createdBy: providerId,
    });
    await docRepo.save(doc);

    logger.info('KB', 'document uploaded', { documentId: doc.id, cafeId });

    // Async indexing — do not await
    setImmediate(() => {
      kbService
        .processDocument(doc.id)
        .catch((err) => logger.error('KB', 'background processDocument failed', err));
    });

    res.status(201).json({
      id: doc.id,
      title: doc.title,
      original_filename: doc.originalFilename,
      content_type: doc.contentType,
      status: doc.status,
      created_at: doc.createdAt,
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/cafes/:cafeId/kb/documents  [auth]
export async function listDocuments(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { cafeId } = req.params;
    const providerId = req.user!.userId;

    const cafeRows = await AppDataSource.query<{ provider_id: string }[]>(
      `SELECT provider_id FROM cafes WHERE id = $1`,
      [cafeId],
    );
    if (!cafeRows.length) {
      return next(new AppError('Cafe không tồn tại.', 404, 'CAFE_NOT_FOUND'));
    }
    if (cafeRows[0].provider_id !== providerId && req.user!.role !== UserRole.ADMIN) {
      return next(new AppError('Forbidden', 403, 'FORBIDDEN'));
    }

    const rows = await AppDataSource.query<
      {
        id: string;
        title: string;
        original_filename: string;
        content_type: string;
        status: string;
        chunk_count: string;
        created_at: Date;
        updated_at: Date;
      }[]
    >(
      `SELECT d.id, d.title, d.original_filename, d.content_type, d.status,
              COUNT(c.id) AS chunk_count, d.created_at, d.updated_at
       FROM kb_documents d
       LEFT JOIN kb_chunks c ON c.document_id = d.id
       WHERE d.cafe_id = $1 AND d.deleted_at IS NULL
       GROUP BY d.id
       ORDER BY d.created_at DESC`,
      [cafeId],
    );

    res.json({
      data: rows.map((r) => ({
        id: r.id,
        title: r.title,
        original_filename: r.original_filename,
        content_type: r.content_type,
        status: r.status,
        chunk_count: Number(r.chunk_count),
        created_at: r.created_at,
        updated_at: r.updated_at,
      })),
      total: rows.length,
    });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/v1/cafes/:cafeId/kb/documents/:documentId  [auth]
export async function deleteDocument(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { cafeId, documentId } = req.params;
    const providerId = req.user!.userId;

    const cafeRows = await AppDataSource.query<{ provider_id: string }[]>(
      `SELECT provider_id FROM cafes WHERE id = $1`,
      [cafeId],
    );
    if (!cafeRows.length) {
      return next(new AppError('Cafe không tồn tại.', 404, 'CAFE_NOT_FOUND'));
    }
    if (cafeRows[0].provider_id !== providerId && req.user!.role !== UserRole.ADMIN) {
      return next(new AppError('Forbidden', 403, 'FORBIDDEN'));
    }

    // Always filter by both cafe_id and document id for isolation
    const docRows = await AppDataSource.query<{ id: string }[]>(
      `SELECT id FROM kb_documents WHERE id = $1 AND cafe_id = $2 AND deleted_at IS NULL`,
      [documentId, cafeId],
    );
    if (!docRows.length) {
      return next(new AppError('Tài liệu không tồn tại.', 404, 'DOCUMENT_NOT_FOUND'));
    }

    // Soft-delete document; ON DELETE CASCADE removes kb_chunks
    await AppDataSource.query(
      `UPDATE kb_documents SET deleted_at = now() WHERE id = $1 AND cafe_id = $2`,
      [documentId, cafeId],
    );
    // Hard-delete chunks (FK cascade should handle this, but be explicit)
    await AppDataSource.query(`DELETE FROM kb_chunks WHERE document_id = $1 AND cafe_id = $2`, [
      documentId,
      cafeId,
    ]);

    logger.info('KB', 'document deleted', { documentId, cafeId });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/cafes/:cafeId/kb/debug?query=...
export async function debugKb(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { cafeId } = req.params;
    const query = req.query.query as string | undefined;
    const top = Math.min(parseInt((req.query.top as string) ?? '5', 10), 20);

    const [cafeRow] = await AppDataSource.query<{ name: string; address: string }[]>(
      `SELECT name, address FROM cafes WHERE id = $1`,
      [cafeId],
    );

    // KB summary
    const [summary] = await AppDataSource.query<
      {
        doc_count: string;
        chunk_count: string;
        indexed: string;
        failed: string;
        pending: string;
      }[]
    >(
      `SELECT
         COUNT(DISTINCT d.id)                                              AS doc_count,
         COUNT(c.id)                                                       AS chunk_count,
         COUNT(DISTINCT d.id) FILTER (WHERE d.status = 'INDEXED')         AS indexed,
         COUNT(DISTINCT d.id) FILTER (WHERE d.status = 'FAILED')          AS failed,
         COUNT(DISTINCT d.id) FILTER (WHERE d.status = 'PENDING')         AS pending
       FROM kb_documents d
       LEFT JOIN kb_chunks c ON c.document_id = d.id
       WHERE d.cafe_id = $1 AND d.deleted_at IS NULL`,
      [cafeId],
    );

    const documents = await AppDataSource.query<
      {
        id: string;
        title: string;
        status: string;
        chunk_count: string;
        created_at: Date;
      }[]
    >(
      `SELECT d.id, d.title, d.status, COUNT(c.id) AS chunk_count, d.created_at
       FROM kb_documents d
       LEFT JOIN kb_chunks c ON c.document_id = d.id
       WHERE d.cafe_id = $1 AND d.deleted_at IS NULL
       GROUP BY d.id ORDER BY d.created_at DESC`,
      [cafeId],
    );

    if (!query) {
      res.json({
        cafe: { name: cafeRow?.name ?? '', address: cafeRow?.address ?? '' },
        summary: {
          doc_count: Number(summary.doc_count),
          chunk_count: Number(summary.chunk_count),
          indexed: Number(summary.indexed),
          failed: Number(summary.failed),
          pending: Number(summary.pending),
        },
        documents: documents.map((d) => ({ ...d, chunk_count: Number(d.chunk_count) })),
        chunks: [],
        verdict: null,
      });
      return;
    }

    const queryEmbedding = await kbService.embedText(query);

    const chunks = await AppDataSource.query<
      {
        chunk_text: string;
        doc_title: string;
        chunk_index: number;
        score: number;
      }[]
    >(
      `SELECT c.chunk_text, d.title AS doc_title, c.chunk_index,
              1 - (c.embedding <=> $2::vector) AS score
       FROM kb_chunks c
       JOIN kb_documents d ON c.document_id = d.id
       WHERE c.cafe_id = $1
       ORDER BY c.embedding <=> $2::vector
       LIMIT $3`,
      [cafeId, JSON.stringify(queryEmbedding), top],
    );

    const best = chunks[0]?.score ?? 0;
    const verdict = best >= 0.7 ? 'good' : best >= 0.4 ? 'weak' : 'no_match';

    res.json({
      summary: {
        doc_count: Number(summary.doc_count),
        chunk_count: Number(summary.chunk_count),
        indexed: Number(summary.indexed),
        failed: Number(summary.failed),
        pending: Number(summary.pending),
      },
      documents: documents.map((d) => ({ ...d, chunk_count: Number(d.chunk_count) })),
      query,
      embedding_dims: queryEmbedding.length,
      chunks: chunks.map((c) => ({ ...c, score: Number(c.score) })),
      verdict,
    });
  } catch (err) {
    next(err);
  }
}
