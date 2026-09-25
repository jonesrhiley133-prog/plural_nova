import type { Server as HttpServer } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { findSession } from '../auth/sessions.js';

/**
 * Realtime fan-out.
 *
 * One socket per open client, keyed by account. Everything that should feel
 * immediate — a message arriving, a front changing, a poll closing — is pushed
 * from the write that caused it, so nothing polls on a timer.
 */

export type RealtimeEvent =
  | { type: 'record.changed'; collection: string; id: string; action: 'created' | 'updated' | 'deleted' }
  | { type: 'message.new'; threadId: string; messageId: string; fromUserId: string }
  | { type: 'message.read'; threadId: string; byUserId: string }
  | { type: 'message.deleted'; threadId: string; messageId: string }
  | { type: 'reaction.new'; threadId: string; messageId: string; kind: 'dm' | 'system' }
  | { type: 'front.changed'; systemId: string }
  | { type: 'notification.new'; notificationId: string; category: string }
  | { type: 'friend.request'; requestId: string; fromUserId: string }
  | { type: 'friend.accepted'; userId: string }
  | { type: 'flux.activity'; postId: string; kind: 'reaction' | 'comment' }
  | { type: 'poll.updated'; pollId: string }
  | { type: 'systemChat.new'; threadId: string; messageId: string }
  | { type: 'systemChat.thread.new'; threadId: string }
  | { type: 'sync.hint'; cursor: string }
  | { type: 'pong' };

interface Client {
  socket: WebSocket;
  userId: string;
  sessionId: string;
}

const clients = new Set<Client>();
const byUser = new Map<string, Set<Client>>();

export function attachRealtime(server: HttpServer): WebSocketServer {
  const wss = new WebSocketServer({ server, path: '/realtime' });

  wss.on('connection', (socket, request) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    const token = url.searchParams.get('token');
    const session = token ? findSession(token) : null;

    if (!session) {
      // Closed with a policy code so the client can tell "signed out" apart
      // from "network dropped" and decide whether reconnecting is worthwhile.
      socket.close(4401, 'Authentication required');
      return;
    }

    const client: Client = { socket, userId: session.userId, sessionId: session.id };
    clients.add(client);
    let bucket = byUser.get(session.userId);
    if (!bucket) {
      bucket = new Set();
      byUser.set(session.userId, bucket);
    }
    bucket.add(client);

    socket.on('message', (raw) => {
      try {
        const parsed = JSON.parse(String(raw)) as { type?: string };
        if (parsed.type === 'ping') socket.send(JSON.stringify({ type: 'pong' }));
      } catch {
        // A malformed frame is ignored; the connection stays usable.
      }
    });

    const cleanup = (): void => {
      clients.delete(client);
      const set = byUser.get(client.userId);
      set?.delete(client);
      if (set && set.size === 0) byUser.delete(client.userId);
    };
    socket.on('close', cleanup);
    socket.on('error', cleanup);

    socket.send(JSON.stringify({ type: 'ready' }));
  });

  return wss;
}

export function publish(userId: string, event: RealtimeEvent): void {
  const bucket = byUser.get(userId);
  if (!bucket || bucket.size === 0) return;
  const payload = JSON.stringify(event);
  for (const client of bucket) {
    if (client.socket.readyState === client.socket.OPEN) {
      client.socket.send(payload);
    }
  }
}

export function publishToMany(userIds: Iterable<string>, event: RealtimeEvent): void {
  for (const id of new Set(userIds)) publish(id, event);
}

export function isOnline(userId: string): boolean {
  return (byUser.get(userId)?.size ?? 0) > 0;
}

export function connectionCount(): number {
  return clients.size;
}

export function closeAll(): void {
  for (const client of clients) client.socket.close(1001, 'Server shutting down');
  clients.clear();
  byUser.clear();
}
