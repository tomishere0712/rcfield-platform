import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage, Server } from 'http';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { AuthPayload } from '../types';

export class WebSocketService {
  private wss!: WebSocketServer;
  private clients = new Map<string, Set<WebSocket>>();
  private clientsByCafe = new Map<string, Set<WebSocket>>();

  init(server: Server): void {
    this.wss = new WebSocketServer({ server, path: '/ws' });
    this.wss.on('connection', (ws, req) => this.onConnection(ws, req));
    logger.info('WebSocket', 'server started', { path: '/ws' });
  }

  private onConnection(ws: WebSocket, req: IncomingMessage): void {
    const token = new URL(req.url ?? '/', 'ws://host').searchParams.get('token');
    if (!token) {
      ws.close(4001, 'Unauthorized');
      return;
    }
    try {
      const payload = jwt.verify(token, env.jwt.secret) as AuthPayload;
      const userId = payload.userId;
      const cafeId = payload.cafeId;

      if (!this.clients.has(userId)) this.clients.set(userId, new Set());
      this.clients.get(userId)!.add(ws);

      if (cafeId) {
        if (!this.clientsByCafe.has(cafeId)) this.clientsByCafe.set(cafeId, new Set());
        this.clientsByCafe.get(cafeId)!.add(ws);
      }

      ws.on('close', () => {
        this.clients.get(userId)?.delete(ws);
        if (cafeId) this.clientsByCafe.get(cafeId)?.delete(ws);
      });

      logger.info('WebSocket', 'client connected', { userId, cafeId });
    } catch {
      ws.close(4001, 'Invalid token');
    }
  }

  pushToUser(userId: string, event: string, data: unknown): void {
    const sockets = this.clients.get(userId);
    if (!sockets?.size) return;
    const payload = JSON.stringify({ event, data });
    sockets.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(payload);
    });
  }

  pushToCafe(cafeId: string, event: string, data: unknown): void {
    const sockets = this.clientsByCafe.get(cafeId);
    if (!sockets?.size) return;
    const payload = JSON.stringify({ event, data });
    sockets.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(payload);
    });
  }

  /**
   * Cắt mọi kết nối để tiến trình còn thoát được.
   *
   * Dùng `terminate()` chứ không `close()`: `close()` gửi khung đóng rồi CHỜ
   * phía kia đáp lại. Trình duyệt đang ở tab nền có thể không đáp trong nhiều
   * giây, và trong lúc đó cả tiến trình vẫn giữ cổng — đúng thứ làm lần khởi
   * động sau chết vì cổng đã có người dùng.
   */
  shutdown(): void {
    if (!this.wss) return;
    this.wss.clients.forEach((ws) => ws.terminate());
    this.clients.clear();
    this.clientsByCafe.clear();
    this.wss.close();
    logger.info('WebSocket', 'server stopped');
  }
}

export const wsService = new WebSocketService();
