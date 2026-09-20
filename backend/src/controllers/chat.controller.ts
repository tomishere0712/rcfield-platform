import { Request, Response, NextFunction } from 'express';
import { AppError, AuthRequest } from '../types';
import { ChatMessageSchema, WidgetConfigSchema } from '../validate';
import { env } from '../config/env';
import {
  checkGate,
  consumeProviderAIQuota,
  route,
  fastAnswer,
  thanksAnswer,
  farewellAnswer,
  ragChat,
  ragChatStream,
  getWidgetConfigForCafe,
  upsertWidgetConfig,
} from '../services/chat.service';
import { logger } from '../config/logger';

const DEFAULT_CONFIG = {
  greeting_message: 'Xin chào! Tôi có thể giúp gì cho bạn?',
  position: 'bottom-right',
  primary_color: '#2563EB',
  avatar_url: null,
  quick_replies: [] as string[],
  system_prompt: null as string | null,
  is_default: true,
};

// POST /api/v1/cafes/:cafeId/chat
export async function chat(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { cafeId } = req.params;

    const parsed = ChatMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(new AppError(parsed.error.errors[0].message, 400, 'VALIDATION_ERROR'));
    }

    const { message, history } = parsed.data;

    logger.info('Chat', 'request', { cafeId, message });

    await checkGate(cafeId);

    const { route: chatRoute, confidence } = await route(message);
    const modelUsed =
      chatRoute === 'rag' ? (confidence >= 0.7 ? env.ai.model : env.ai.supportModel) : '(no LLM)';
    logger.info('Chat', `route → ${chatRoute}  model: ${modelUsed}`, {
      cafeId,
      nluConfidence: confidence,
    });

    const t0 = Date.now();
    let response;
    if (chatRoute === 'fast') {
      response = await fastAnswer(cafeId);
    } else if (chatRoute === 'thanks') {
      response = thanksAnswer();
    } else if (chatRoute === 'farewell') {
      response = farewellAnswer();
    } else {
      response = await ragChat(cafeId, message, history, confidence);
    }
    logger.info('Chat', `done in ${Date.now() - t0}ms`, {
      cafeId,
      responseType: response.responseType,
    });

    await consumeProviderAIQuota(cafeId);

    res.json({
      answer: response.answer,
      response_type: response.responseType,
      ...(response.data !== undefined && { data: response.data }),
      ...(response.sources !== undefined && { sources: response.sources }),
      ...(response.quickReplies !== undefined && { quick_replies: response.quickReplies }),
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/cafes/:cafeId/chat/stream  — SSE streaming
export async function chatStream(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { cafeId } = req.params;

    const parsed = ChatMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(new AppError(parsed.error.errors[0].message, 400, 'VALIDATION_ERROR'));
    }

    const { message, history } = parsed.data;

    await checkGate(cafeId);

    const { route: chatRoute, confidence } = await route(message);
    logger.info('Chat', `stream route → ${chatRoute}`, { cafeId, message });

    // Quota check must happen before flushHeaders — once SSE headers are committed
    // the error middleware can no longer send a JSON error response.
    await consumeProviderAIQuota(cafeId);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const send = (event: string, data: unknown) =>
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

    // Non-RAG routes: wrap single answer as SSE so client always speaks the same protocol
    if (chatRoute !== 'rag') {
      let response;
      if (chatRoute === 'fast') response = await fastAnswer(cafeId);
      else if (chatRoute === 'thanks') response = thanksAnswer();
      else response = farewellAnswer();
      send('chunk', { text: response.answer });
      send('done', {
        response_type: response.responseType,
        full_answer: response.answer,
        ...(response.data !== undefined && { data: response.data }),
        ...(response.quickReplies !== undefined && { quick_replies: response.quickReplies }),
      });
      res.end();
      return;
    }

    const t0 = Date.now();
    const { stream, sources, quickRepliesPromise } = await ragChatStream(
      cafeId,
      message,
      history,
      confidence,
    );

    let fullAnswer = '';
    for await (const token of stream) {
      fullAnswer += token;
      send('chunk', { text: token });
    }

    // Send done immediately so FE unlocks input — quick replies arrive separately
    send('done', { response_type: 'text', sources, full_answer: fullAnswer });

    logger.info('Chat', `stream done in ${Date.now() - t0}ms`, { cafeId });

    const quickReplies = await quickRepliesPromise;
    send('quick_replies', { quick_replies: quickReplies });
    res.end();
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/cafes/:cafeId/chat/config
export async function getWidgetConfig(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { cafeId } = req.params;
    const config = await getWidgetConfigForCafe(cafeId);

    if (!config) {
      res.json(DEFAULT_CONFIG);
      return;
    }

    // isEnabled = false means provider has never explicitly configured the widget
    const isDefault = !config.isEnabled;
    res.json({
      greeting_message: config.greetingMessage,
      position: config.position.toLowerCase().replace('_', '-'),
      primary_color: config.primaryColor,
      avatar_url: config.avatarUrl,
      quick_replies: config.quickReplies,
      system_prompt: config.systemPrompt,
      is_default: isDefault,
    });
  } catch (err) {
    next(err);
  }
}

// PUT /api/v1/cafes/:cafeId/chat/config  [auth]
export async function updateWidgetConfig(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { cafeId } = req.params;
    const providerId = req.user!.userId;

    const { AppDataSource } = await import('../config/database');
    const cafeRows = await AppDataSource.query<{ provider_id: string }[]>(
      `SELECT provider_id FROM cafes WHERE id = $1`,
      [cafeId],
    );
    if (!cafeRows.length) {
      return next(new AppError('Cafe không tồn tại.', 404, 'CAFE_NOT_FOUND'));
    }
    if (cafeRows[0].provider_id !== providerId) {
      return next(new AppError('Forbidden', 403, 'FORBIDDEN'));
    }

    const parsed = WidgetConfigSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(new AppError(parsed.error.errors[0].message, 400, 'VALIDATION_ERROR'));
    }

    const body = parsed.data;
    const config = await upsertWidgetConfig(cafeId, {
      ...(body.greeting_message !== undefined && { greetingMessage: body.greeting_message }),
      ...(body.position !== undefined && { position: body.position }),
      ...(body.primary_color !== undefined && { primaryColor: body.primary_color }),
      ...(body.avatar_url !== undefined && { avatarUrl: body.avatar_url }),
      ...(body.quick_replies !== undefined && { quickReplies: body.quick_replies }),
      ...(body.system_prompt !== undefined && { systemPrompt: body.system_prompt }),
    });

    res.json({
      greeting_message: config.greetingMessage,
      position: config.position.toLowerCase().replace('_', '-'),
      primary_color: config.primaryColor,
      avatar_url: config.avatarUrl,
      quick_replies: config.quickReplies,
      system_prompt: config.systemPrompt,
      is_default: false,
    });
  } catch (err) {
    next(err);
  }
}
