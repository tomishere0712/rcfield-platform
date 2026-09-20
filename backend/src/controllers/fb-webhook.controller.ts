import { Request, Response } from 'express';
import { AppDataSource } from '../config/database';
import { redis } from '../config/redis';
import { env } from '../config/env';
import { logger } from '../config/logger';
import {
  AppError,
  ChannelStatus,
  ChannelType,
  FbFormattedMessage,
  FbMessagingEvent,
} from '../types';
import { CafeChannel } from '../models/cafe-channel.entity';
import { incrementAIQuota } from '../services/subscription.service';
import { decryptToken } from '../utils/crypto';
import {
  checkGate,
  route,
  fastAnswer,
  thanksAnswer,
  farewellAnswer,
  ragChat,
} from '../services/chat.service';
import { FbMessengerFormatter } from '../services/fb-messenger.formatter';
import {
  sendMessage,
  sendText,
  sendImage,
  markSeen,
  typingOn,
} from '../services/fb-messenger.service';
import {
  describeDraftForContext,
  pendingBookingQuestion,
  tryHandleBookingTurn,
} from '../services/fb-booking-orchestrator';
import { appendTurn, clearHistory, loadHistory } from '../services/fb-conversation-memory';
import { getFbChatQueue } from '../queues/fb-chat.queue';

interface FbWebhookPayload {
  object: string;
  entry: Array<{
    id: string;
    messaging: FbMessagingEvent[];
  }>;
}

/**
 * Ngân sách thời gian cho một lượt trả lời (FR-030).
 *
 * Không phải hạn của Facebook — webhook đã được xác nhận từ trước, ở
 * `handleWebhookEvent`. Đây là hạn với KHÁCH: quá lâu mà không có gì thì họ bỏ
 * đi, và tệ hơn là họ nhắn lại, sinh thêm một lượt xử lý nữa.
 */
const REPLY_BUDGET_MS = 10_000;

/** Lỗi riêng để phân biệt hết giờ với lỗi nghiệp vụ — hai thứ này báo cho khách khác nhau. */
class ReplyBudgetExceeded extends Error {}

async function withReplyBudget<T>(work: () => Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      work(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new ReplyBudgetExceeded()), REPLY_BUDGET_MS);
      }),
    ]);
  } finally {
    // Không dọn thì tiến trình giữ một bộ đếm sống cho MỖI tin nhắn.
    if (timer) clearTimeout(timer);
  }
}

export async function processEvent(event: FbMessagingEvent, pageId: string): Promise<void> {
  if (event.message?.is_echo) return;
  if (!event.message?.text) return;

  const psid = event.sender.id;
  const text = event.message.text;
  const mid = event.message.mid;

  // Resolve channel — page_id maps 1:1 to a cafe
  const channel = await AppDataSource.getRepository(CafeChannel).findOne({
    where: { pageId, channelType: ChannelType.FACEBOOK_MESSENGER, status: ChannelStatus.CONNECTED },
  });
  if (!channel) {
    logger.warn('Facebook Webhook', 'unknown page_id', { pageId });
    return;
  }
  const pageToken = decryptToken(channel.encryptedPageToken, env.facebook.encryptionKey as Buffer);
  const cafeId = channel.cafeId;

  // Dedup by message mid
  const dedup = await redis.set(`facebook:processed:${pageId}:${mid}`, '1', 'EX', 300, 'NX');
  if (!dedup) return;

  // ── Process chat message ─────────────────────────────────────────────────────
  const providerRows = await AppDataSource.query<{ provider_id: string; role: string }[]>(
    `SELECT c.provider_id, u.role FROM cafes c JOIN users u ON u.id = c.provider_id WHERE c.id = $1`,
    [cafeId],
  );
  const providerId = providerRows[0]?.provider_id;
  const providerRole = providerRows[0]?.role;

  const typingAt = Date.now();
  await Promise.all([markSeen(psid, pageToken), typingOn(psid, pageToken)]);

  try {
    await checkGate(cafeId);
    if (providerId && providerRole !== 'ADMIN') await incrementAIQuota(providerId);

    // Luồng đặt lịch được hỏi trước. Trả `null` nghĩa là lượt này không thuộc
    // luồng đó, và đường hỏi–đáp bên dưới chạy y như trước — thêm tính năng này
    // không đụng gì tới hành vi trả lời câu hỏi đã có.
    //
    // Bọc trong ngân sách thời gian (FR-030): một lượt đặt lịch có thể gọi bộ
    // trích xuất rồi tới lượt sinh câu trả lời, mỗi bước một lần gọi mô hình.
    // Chuỗi đó kéo dài bất định, mà khách ngồi nhìn chỉ báo "đang soạn tin"
    // không có hồi kết thì bỏ đi.
    const bookingTurn = await withReplyBudget(() =>
      tryHandleBookingTurn({ cafeId, pageId, psid, text }),
    );
    if (bookingTurn) {
      const message: FbFormattedMessage = {
        text: bookingTurn.text,
        quickReplies: [],
        ...(bookingTurn.paymentUrl
          ? {
              buttons: [{ type: 'web_url', url: bookingTurn.paymentUrl, title: 'Thanh toán ngay' }],
            }
          : {}),
      };
      await sendMessage(psid, message, pageToken);

      // Ảnh gửi thành tin RIÊNG: Messenger không kèm được chữ trong tin ảnh.
      // Gửi sau phần chữ để khách đọc được số tiền và hạn thanh toán trước.
      if (bookingTurn.qrImageUrl) {
        await sendImage(psid, bookingTurn.qrImageUrl, pageToken).catch((err) =>
          // Mất ảnh QR không sao — nút bấm mới là đường đi chính trên điện thoại.
          logger.warn('Facebook Webhook', 'gửi ảnh QR thất bại', err),
        );
      }

      await appendTurn(pageId, psid, text, bookingTurn.text);
      logger.info('Facebook Webhook', 'booking turn handled', { cafeId, psid });
      return;
    }

    const { route: chatRoute, confidence, nluAvailable } = await route(text);

    // Lịch sử của CHÍNH cuộc trò chuyện này. Widget web được trình duyệt gửi
    // kèm lịch sử mỗi lượt; Facebook thì không có ai làm hộ, nên máy chủ tự
    // giữ — xem `fb-conversation-memory.ts`.
    const history = await loadHistory(pageId, psid);

    // Khách đang đặt lịch dở mà hỏi một câu giữa chừng: ghép những gì họ đã khai
    // vào đầu ngữ cảnh. Không có bước này thì bot trả lời "không biết tên bạn"
    // trong khi nó đang giữ cái tên đó trong đơn nháp — lịch sử chữ chỉ còn 5
    // lượt gần nhất nên lượt khai tên đã trôi mất.
    const draftContext = await describeDraftForContext(pageId, psid);
    const contextualHistory = draftContext
      ? [{ role: 'model' as const, content: draftContext }, ...history]
      : history;

    let response;
    if (chatRoute === 'fast') response = await fastAnswer(cafeId);
    else if (chatRoute === 'thanks') response = thanksAnswer();
    else if (chatRoute === 'farewell') response = farewellAnswer();
    else response = await ragChat(cafeId, text, contextualHistory, confidence, nluAvailable);

    const formatted = FbMessengerFormatter.format(response);

    // Khách đang đặt lịch dở mà hỏi xen ngang: trả lời câu hỏi XONG thì nhắc lại
    // chỗ đang dừng.
    //
    // Không nhắc thì luồng đặt lịch im lặng đứng lại — bot vẫn chờ số điện thoại
    // nhưng không nói ra, và từ phía khách nó đã bốc hơi. Họ không biết mình cần
    // làm gì tiếp, cũng không biết là vẫn còn đơn dở.
    const pending = await pendingBookingQuestion(pageId, psid);
    if (pending) formatted.text = `${formatted.text}\n\n---\n${pending}`;

    const elapsed = Date.now() - typingAt;
    if (elapsed < 1500) await new Promise((r) => setTimeout(r, 1500 - elapsed));

    await sendMessage(psid, formatted, pageToken);
    logger.info('Facebook Webhook', 'replied', { cafeId, pageId, psid });

    // Ghi SAU khi đã gửi: khách không phải chờ Redis, và lượt nào gửi hỏng thì
    // cũng không lọt vào lịch sử.
    //
    // Chào tạm biệt thì dọn luôn — lần sau quay lại là chuyện khác, nối tiếp
    // ngữ cảnh cũ chỉ làm bot đoán sai.
    if (chatRoute === 'farewell') {
      await clearHistory(pageId, psid);
    } else {
      await appendTurn(pageId, psid, text, response.answer);
    }
  } catch (err) {
    // Hết ngân sách: phải nói cho khách biết, không được im lặng bỏ lượt
    // (FR-030). Im lặng là kiểu hỏng tệ nhất ở đây — khách không biết nên chờ
    // tiếp hay nhắn lại.
    if (err instanceof ReplyBudgetExceeded) {
      logger.warn('Facebook Webhook', 'quá ngân sách trả lời', { cafeId, psid });
      await sendText(
        psid,
        'Xin lỗi, hệ thống đang xử lý hơi lâu. Bạn nhắn lại giúp mình nhé!',
        pageToken,
      ).catch(() => undefined);
      return;
    }

    if (
      err instanceof AppError &&
      (err.code === 'AI_DISABLED' ||
        err.code === 'QUOTA_EXCEEDED' ||
        err.code === 'AI_QUOTA_EXCEEDED')
    ) {
      if (err.code === 'AI_QUOTA_EXCEEDED') {
        logger.warn('Facebook Webhook', 'AI quota exceeded', { providerId, cafeId });
      }
      await sendText(
        psid,
        'Xin lỗi, dịch vụ hỗ trợ tự động hiện không khả dụng. Vui lòng liên hệ trực tiếp chi nhánh.',
        pageToken,
      );
      return;
    }
    logger.error('Facebook Webhook', 'processing error', err);
  }
}

// GET /api/v1/webhook/facebook
export function verifyWebhook(req: Request, res: Response): void {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === env.facebook.verifyToken) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
}

// POST /api/v1/webhook/facebook
export function handleWebhookEvent(req: Request, res: Response): void {
  res.sendStatus(200);

  const payload = req.body as FbWebhookPayload;
  if (payload?.object !== 'page') return;
  if (!env.features.fbChatQueueEnabled) {
    logger.warn('Facebook Webhook', 'queue disabled; skipping webhook event processing');
    return;
  }

  for (const entry of payload.entry ?? []) {
    const pageId = entry.id;
    for (const event of entry.messaging ?? []) {
      getFbChatQueue()
        .add('process', { event, pageId })
        .then((job) => {
          logger.info('Facebook Webhook', 'enqueued', {
            jobId: job.id,
            pageId,
            psid: event.sender.id,
          });
        })
        .catch((err) => {
          logger.error('Facebook Webhook', 'failed to enqueue event', err);
        });
    }
  }
}
