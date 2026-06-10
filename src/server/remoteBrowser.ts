import { customAlphabet } from 'nanoid';
import { settings } from './config.js';

const FRIENDLY_CHARS = '23456789abcdefghijkmnpqrstuvwxyz';
export const generateId = customAlphabet(FRIENDLY_CHARS, 7);

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
}

export interface CDPConnection {
  ws: WebSocket;
  id: number;
  pending: Map<number, PendingRequest>;
  events: Map<string, ((params: unknown) => void)[]>;
}

export interface BrowserPage {
  conn: CDPConnection;
  sessionId: string;
  targetId: string;
  browserId: string;
}

export function cdpConnect(url: string): Promise<CDPConnection> {
  const conn: CDPConnection = {
    ws: null as unknown as WebSocket,
    id: 0,
    pending: new Map(),
    events: new Map(),
  };
  return new Promise((resolve, reject) => {
    conn.ws = new WebSocket(url);
    conn.ws.onopen = () => resolve(conn);
    conn.ws.onerror = () => reject(new Error('WebSocket connection error'));
    conn.ws.onmessage = (event) => {
      const raw =
        typeof event.data === 'string' ? event.data : event.data.toString();
      const msg = JSON.parse(raw);
      if (msg.id != null && conn.pending.has(msg.id)) {
        const { resolve: ok, reject: fail } = conn.pending.get(msg.id)!;
        conn.pending.delete(msg.id);
        if (msg.error) {
          fail(new Error(msg.error.message));
        } else {
          ok(msg.result);
        }
      } else if (msg.method) {
        const key = msg.sessionId
          ? `${msg.sessionId}:${msg.method}`
          : msg.method;
        conn.events.get(key)?.forEach((h) => h(msg.params));
      }
    };
  });
}

export function cdpSend(
  conn: CDPConnection,
  method: string,
  params: Record<string, unknown> = {},
  sessionId?: string
): Promise<unknown> {
  const id = ++conn.id;
  const msg = JSON.stringify({
    id,
    method,
    params,
    ...(sessionId && { sessionId }),
  });
  return new Promise((resolve, reject) => {
    conn.pending.set(id, { resolve, reject });
    conn.ws.send(msg);
  });
}

export function cdpOnce(
  conn: CDPConnection,
  method: string,
  sessionId?: string
): Promise<unknown> {
  const key = sessionId ? `${sessionId}:${method}` : method;
  return new Promise((resolve) => {
    const handler = (params: unknown) => {
      const handlers = conn.events.get(key);
      if (handlers) {
        const idx = handlers.indexOf(handler);
        if (idx !== -1) handlers.splice(idx, 1);
      }
      resolve(params);
    };
    if (!conn.events.has(key)) conn.events.set(key, []);
    conn.events.get(key)!.push(handler);
  });
}

export function cdpDisconnect(conn: CDPConnection): void {
  conn.ws.close();
}

export async function createRemoteBrowser(
  id: string,
  headers?: Record<string, string>
): Promise<CDPConnection> {
  const url = `${settings.GETGATHER_URL}/api/v1/browsers/${id}`;
  const fetchHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...headers,
  };
  const response = await fetch(url, {
    method: 'POST',
    headers: fetchHeaders,
  });
  if (!response.ok) {
    throw new Error(
      `Failed to create remote browser: ${response.status} ${response.statusText}`
    );
  }
  const data = await response.json();
  if (
    data === null ||
    typeof data !== 'object' ||
    Array.isArray(data) ||
    !('status' in data)
  ) {
    throw new Error(
      `Unexpected response from createRemoteBrowser: ${JSON.stringify(data)}`
    );
  }
  const wsBase = settings.GETGATHER_URL.replace(/^http/, 'ws');
  const wsUrl = `${wsBase}/cdp/${id}`;
  return await cdpConnect(wsUrl);
}

export async function destroyRemoteBrowser(browserId: string): Promise<void> {
  const url = `${settings.GETGATHER_URL}/api/v1/browsers/${browserId}`;
  await fetch(url, { method: 'DELETE' });
}

export async function createPage(
  conn: CDPConnection,
  browserId: string
): Promise<BrowserPage> {
  const { targetId } = (await cdpSend(conn, 'Target.createTarget', {
    url: 'about:blank',
  })) as { targetId: string };

  const { sessionId } = (await cdpSend(conn, 'Target.attachToTarget', {
    targetId,
    flatten: true,
  })) as { sessionId: string };

  await cdpSend(conn, 'Page.enable', {}, sessionId);

  return { conn, sessionId, targetId, browserId };
}

export async function navigatePage(
  page: BrowserPage,
  url: string
): Promise<void> {
  const loaded = cdpOnce(page.conn, 'Page.loadEventFired', page.sessionId);
  await cdpSend(page.conn, 'Page.navigate', { url }, page.sessionId);
  await loaded;
}

export async function distillPage(
  page: BrowserPage,
  headers?: Record<string, string>
): Promise<unknown> {
  const url = `${settings.GETGATHER_URL}/api/v1/browsers/${page.browserId}/pages/${page.targetId}/distilled`;
  const response = await fetch(url, {
    method: 'GET',
    headers: headers || {},
  });
  if (!response.ok) {
    throw new Error(
      `Failed to distill page: ${response.status} ${response.statusText}`
    );
  }
  return await response.json();
}

export async function closeTarget(
  conn: CDPConnection,
  targetId: string
): Promise<void> {
  await cdpSend(conn, 'Target.closeTarget', { targetId });
}
