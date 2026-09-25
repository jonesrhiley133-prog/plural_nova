import { getToken, onTokenChange } from './api.js';
import { syncEngine } from './sync.js';

/**
 * The realtime channel.
 *
 * One socket per signed-in tab. It carries small notices — a message arrived,
 * the front changed — and the app responds by refreshing the affected data
 * rather than trusting the payload, so a dropped or duplicated notice cannot
 * leave the interface disagreeing with the server.
 *
 * Reconnection backs off; an authentication failure stops retrying entirely,
 * because retrying a rejected token only produces the same rejection.
 */

export type RealtimeEvent =
  | { type: 'ready' }
  | { type: 'pong' }
  | { type: 'record.changed'; collection: string; id: string; action: string }
  | { type: 'message.new'; threadId: string; messageId: string; fromUserId: string }
  | { type: 'message.read'; threadId: string; byUserId: string }
  | { type: 'reaction.new'; threadId: string; messageId: string; kind: 'dm' | 'system' }
  | { type: 'front.changed'; systemId: string }
  | { type: 'notification.new'; notificationId: string; category: string }
  | { type: 'friend.request'; requestId: string; fromUserId: string }
  | { type: 'friend.accepted'; userId: string }
  | { type: 'flux.activity'; postId: string; kind: string }
  | { type: 'poll.updated'; pollId: string }
  | { type: 'systemChat.new'; threadId: string; messageId: string }
  | { type: 'systemChat.thread.new'; threadId: string }
  | { type: 'sync.hint'; cursor: string };

type Handler = (event: RealtimeEvent) => void;

class RealtimeClient {
  private socket: WebSocket | null = null;
  private handlers = new Set<Handler>();
  private attempts = 0;
  private reconnectTimer: number | null = null;
  private heartbeat: number | null = null;
  private stopped = false;

  connect(): void {
    const token = getToken();
    if (!token || this.socket || this.stopped) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${window.location.host}/realtime?token=${encodeURIComponent(token)}`;

    let socket: WebSocket;
    try {
      socket = new WebSocket(url);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.socket = socket;

    socket.onopen = () => {
      this.attempts = 0;
      this.heartbeat = window.setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'ping' }));
      }, 45_000);
    };

    socket.onmessage = (message) => {
      let event: RealtimeEvent;
      try {
        event = JSON.parse(String(message.data)) as RealtimeEvent;
      } catch {
        return;
      }
      if (event.type === 'pong') return;

      // Anything that changes stored data triggers a pull, so the local copy is
      // the server's copy rather than a guess assembled from the notice.
      if (event.type === 'record.changed' || event.type === 'sync.hint' || event.type === 'front.changed') {
        syncEngine.schedule(300);
      }
      for (const handler of this.handlers) handler(event);
    };

    socket.onclose = (closeEvent) => {
      this.cleanupSocket();
      // 4401 is the server saying the token is not valid; reconnecting cannot help.
      if (closeEvent.code !== 4401) this.scheduleReconnect();
    };

    socket.onerror = () => {
      socket.close();
    };
  }

  private cleanupSocket(): void {
    if (this.heartbeat !== null) {
      window.clearInterval(this.heartbeat);
      this.heartbeat = null;
    }
    this.socket = null;
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer !== null) return;
    this.attempts += 1;
    // Exponential with a ceiling, so a server outage does not become a flood.
    const delay = Math.min(30_000, 1000 * 2 ** Math.min(this.attempts, 5));
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  disconnect(): void {
    this.stopped = true;
    if (this.reconnectTimer !== null) window.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.socket?.close();
    this.cleanupSocket();
  }

  restart(): void {
    this.stopped = false;
    this.attempts = 0;
    this.socket?.close();
    this.cleanupSocket();
    this.connect();
  }

  on(handler: Handler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  get connected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }
}

export const realtime = new RealtimeClient();

export function startRealtime(): () => void {
  realtime.restart();
  const unsubscribe = onTokenChange((token) => {
    if (token) realtime.restart();
    else realtime.disconnect();
  });

  const onVisible = (): void => {
    if (document.visibilityState === 'visible' && !realtime.connected) realtime.restart();
  };
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('online', onVisible);

  return () => {
    unsubscribe();
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('online', onVisible);
    realtime.disconnect();
  };
}
