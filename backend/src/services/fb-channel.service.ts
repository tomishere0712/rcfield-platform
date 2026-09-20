import { randomBytes } from 'crypto';
import { AppDataSource } from '../config/database';
import { redis } from '../config/redis';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { AppError, ChannelStatus, ChannelType } from '../types';
import { CafeChannel } from '../models/cafe-channel.entity';
import { encryptToken, decryptToken } from '../utils/crypto';
import { checkChannelQuota } from './subscription.service';

const FB_GRAPH = 'https://graph.facebook.com/v21.0';
const OAUTH_URL = 'https://www.facebook.com/v21.0/dialog/oauth';
const NONCE_TTL = 600;

export interface FbChannelStatusResponse {
  connected: boolean;
  pageName?: string;
  pageId?: string;
  connectedAt?: string;
}

export async function buildAuthUrl(
  cafeId: string,
  userId: string,
  returnPath = '/provider/channels',
  userRole = 'PROVIDER',
): Promise<string> {
  const nonce = randomBytes(16).toString('hex');
  await redis.set(
    `oauth:fb:nonce:${nonce}`,
    JSON.stringify({ cafeId, userId, returnPath, userRole }),
    'EX',
    NONCE_TTL,
  );

  const state = Buffer.from(
    JSON.stringify({ cafeId, nonce, userId, returnPath, userRole }),
  ).toString('base64url');
  const params = new URLSearchParams({
    client_id: env.facebook.appId,
    redirect_uri: env.facebook.redirectUri,
    scope: 'pages_show_list,pages_manage_metadata,pages_messaging',
    response_type: 'code',
    state,
  });

  return `${OAUTH_URL}?${params.toString()}`;
}

async function parseAndVerifyState(
  stateParam: string,
): Promise<{ cafeId: string; userId: string; returnPath: string; userRole: string }> {
  let parsed: {
    cafeId: string;
    nonce: string;
    userId: string;
    returnPath?: string;
    userRole?: string;
  };
  try {
    parsed = JSON.parse(Buffer.from(stateParam, 'base64url').toString('utf8')) as typeof parsed;
  } catch {
    throw new AppError('OAuth state không hợp lệ', 400, 'INVALID_STATE');
  }

  const stored = await redis.get(`oauth:fb:nonce:${parsed.nonce}`);
  if (!stored) {
    throw new AppError('OAuth state không khớp hoặc đã hết hạn', 403, 'STATE_MISMATCH');
  }
  const storedData = JSON.parse(stored) as {
    cafeId: string;
    userId: string;
    returnPath?: string;
    userRole?: string;
  };
  if (storedData.cafeId !== parsed.cafeId || storedData.userId !== parsed.userId) {
    throw new AppError('OAuth state không khớp hoặc đã hết hạn', 403, 'STATE_MISMATCH');
  }

  await redis.del(`oauth:fb:nonce:${parsed.nonce}`);
  return {
    cafeId: parsed.cafeId,
    userId: parsed.userId,
    returnPath: storedData.returnPath ?? '/provider/channels',
    userRole: storedData.userRole ?? 'PROVIDER',
  };
}

async function exchangeCodeForShortLivedToken(code: string): Promise<string> {
  const url = `${FB_GRAPH}/oauth/access_token?client_id=${env.facebook.appId}&redirect_uri=${encodeURIComponent(env.facebook.redirectUri)}&client_secret=${env.facebook.appSecret}&code=${code}`;
  const res = await fetch(url);
  const data = (await res.json()) as { access_token?: string; error?: { message: string } };
  if (!data.access_token) {
    throw new AppError(
      data.error?.message ?? 'Không lấy được user token từ Facebook',
      502,
      'FB_TOKEN_ERROR',
    );
  }
  return data.access_token;
}

async function exchangeForLongLivedToken(shortToken: string): Promise<string> {
  const url = `${FB_GRAPH}/oauth/access_token?grant_type=fb_exchange_token&client_id=${env.facebook.appId}&client_secret=${env.facebook.appSecret}&fb_exchange_token=${shortToken}`;
  const res = await fetch(url);
  const data = (await res.json()) as { access_token?: string; error?: { message: string } };
  if (!data.access_token) {
    throw new AppError(
      data.error?.message ?? 'Không exchange được long-lived token',
      502,
      'FB_TOKEN_ERROR',
    );
  }
  return data.access_token;
}

async function fetchPageToken(
  longLivedUserToken: string,
): Promise<{ id: string; name: string; access_token: string }> {
  const url = `${FB_GRAPH}/me/accounts?access_token=${longLivedUserToken}`;
  const res = await fetch(url);
  const data = (await res.json()) as {
    data?: Array<{ id: string; name: string; access_token: string }>;
    error?: { message: string };
  };
  if (!data.data?.length) {
    throw new AppError(
      data.error?.message ?? 'Tài khoản không quản lý Facebook Page nào',
      400,
      'NO_FB_PAGE',
    );
  }
  return data.data[0];
}

async function subscribePageToWebhook(pageId: string, pageToken: string): Promise<void> {
  const url = `${FB_GRAPH}/${pageId}/subscribed_apps`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      subscribed_fields: ['messages', 'messaging_postbacks'],
      access_token: pageToken,
    }),
  });
  const data = (await res.json()) as { success?: boolean; error?: { message: string } };
  if (!data.success) {
    logger.warn('FbChannel', 'subscribed_apps failed', { pageId, error: data.error });
  }
}

export async function handleOAuthCallback(
  code: string,
  state: string,
): Promise<{ returnPath: string }> {
  const { cafeId, userId, returnPath, userRole } = await parseAndVerifyState(state);

  // Admin bypasses ownership check — they manage the platform cafe directly
  if (userRole !== 'ADMIN') {
    const cafeRows = await AppDataSource.query<{ provider_id: string }[]>(
      `SELECT provider_id FROM cafes WHERE id = $1`,
      [cafeId],
    );
    if (!cafeRows.length) {
      throw new AppError('Cafe không tồn tại', 404, 'CAFE_NOT_FOUND');
    }
    if (cafeRows[0].provider_id !== userId) {
      throw new AppError('Forbidden', 403, 'FORBIDDEN');
    }
    await checkChannelQuota(cafeRows[0].provider_id);
  }

  const shortToken = await exchangeCodeForShortLivedToken(code);
  const longToken = await exchangeForLongLivedToken(shortToken);
  const page = await fetchPageToken(longToken);

  const encrypted = encryptToken(page.access_token, env.facebook.encryptionKey as Buffer);

  const repo = AppDataSource.getRepository(CafeChannel);

  // Force-disconnect any other cafe currently connected to this same page_id
  const conflicting = await repo.find({
    where: {
      pageId: page.id,
      channelType: ChannelType.FACEBOOK_MESSENGER,
      status: ChannelStatus.CONNECTED,
    },
  });
  for (const stale of conflicting) {
    if (stale.cafeId !== cafeId) {
      stale.status = ChannelStatus.DISCONNECTED;
      await repo.softRemove(stale);
      logger.warn('FbChannel', 'force-disconnected stale channel on reconnect', {
        staleCafeId: stale.cafeId,
        pageId: page.id,
      });
    }
  }

  const existing = await repo.findOne({
    where: { cafeId, channelType: ChannelType.FACEBOOK_MESSENGER },
    withDeleted: true,
  });

  // Track old pageId to clear sessions if the page changed
  const oldPageId = existing?.pageId;

  if (existing) {
    existing.pageId = page.id;
    existing.pageName = page.name;
    existing.encryptedPageToken = encrypted;
    existing.status = ChannelStatus.CONNECTED;
    existing.connectedAt = new Date();
    existing.deletedAt = null;
    await repo.save(existing);
  } else {
    await repo.save(
      repo.create({
        cafeId,
        channelType: ChannelType.FACEBOOK_MESSENGER,
        status: ChannelStatus.CONNECTED,
        pageId: page.id,
        pageName: page.name,
        encryptedPageToken: encrypted,
        connectedAt: new Date(),
      }),
    );
  }

  // Clear stale Redis sessions so users re-route to the new cafe mapping
  const sessionPatterns = [`fb:cafe-session:${page.id}:*`];
  if (oldPageId && oldPageId !== page.id) sessionPatterns.push(`fb:cafe-session:${oldPageId}:*`);
  for (const pattern of sessionPatterns) {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) await redis.del(...(keys as [string, ...string[]]));
  }

  await subscribePageToWebhook(page.id, page.access_token);
  logger.info('FbChannel', 'connected', { cafeId, pageId: page.id, pageName: page.name });
  return { returnPath };
}

export async function getStatus(cafeId: string): Promise<FbChannelStatusResponse> {
  const repo = AppDataSource.getRepository(CafeChannel);
  const channel = await repo.findOne({
    where: { cafeId, channelType: ChannelType.FACEBOOK_MESSENGER, status: ChannelStatus.CONNECTED },
  });

  if (!channel) return { connected: false };

  return {
    connected: true,
    pageName: channel.pageName,
    pageId: channel.pageId,
    connectedAt: channel.connectedAt.toISOString(),
  };
}

export async function testConnection(
  cafeId: string,
): Promise<{ pageName: string; pageId: string }> {
  const repo = AppDataSource.getRepository(CafeChannel);
  const channel = await repo.findOne({
    where: { cafeId, channelType: ChannelType.FACEBOOK_MESSENGER, status: ChannelStatus.CONNECTED },
  });
  if (!channel)
    throw new AppError('Không có kết nối Facebook nào đang hoạt động', 404, 'NOT_FOUND');

  const pageToken = decryptToken(channel.encryptedPageToken, env.facebook.encryptionKey as Buffer);
  // Verify token by checking subscribed apps — same permission used during connection
  const res = await fetch(
    `${FB_GRAPH}/${channel.pageId}/subscribed_apps?access_token=${pageToken}`,
  );
  const data = (await res.json()) as {
    data?: unknown[];
    error?: { message: string; code?: number };
  };

  if (!res.ok || data.error) {
    logger.error('FbChannel', 'test connection failed', {
      cafeId,
      httpStatus: res.status,
      fbError: data.error,
    });
    throw new AppError(
      data.error?.message ?? 'Token không hợp lệ hoặc đã hết hạn',
      502,
      'FB_CONNECTION_ERROR',
    );
  }

  return { pageName: channel.pageName, pageId: channel.pageId };
}

export async function disconnect(cafeId: string, requestingUserId: string): Promise<void> {
  const cafeRows = await AppDataSource.query<{ provider_id: string }[]>(
    `SELECT provider_id FROM cafes WHERE id = $1`,
    [cafeId],
  );
  if (!cafeRows.length) throw new AppError('Cafe không tồn tại', 404, 'CAFE_NOT_FOUND');
  if (cafeRows[0].provider_id !== requestingUserId)
    throw new AppError('Forbidden', 403, 'FORBIDDEN');

  const repo = AppDataSource.getRepository(CafeChannel);
  const channel = await repo.findOne({
    where: { cafeId, channelType: ChannelType.FACEBOOK_MESSENGER, status: ChannelStatus.CONNECTED },
  });

  if (!channel)
    throw new AppError('Không có kết nối Facebook nào đang hoạt động', 404, 'NOT_FOUND');

  const { pageId } = channel;
  channel.status = ChannelStatus.DISCONNECTED;
  await repo.softRemove(channel);

  // Clear all Redis sessions for this page so next message re-routes correctly
  const sessionKeys = await redis.keys(`fb:cafe-session:${pageId}:*`);
  if (sessionKeys.length > 0) await redis.del(...(sessionKeys as [string, ...string[]]));

  logger.info('FbChannel', 'disconnected', { cafeId, pageId });
}
