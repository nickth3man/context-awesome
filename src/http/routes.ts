import { IncomingMessage, ServerResponse } from 'http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

// --- Prometheus metrics collector (module-level singleton) ---

const metricsStore = new Map<string, number>();

export function incrementMetric(name: string, labels: Record<string, string>): void {
  const labelStr = Object.entries(labels)
    .map(([k, v]) => `${k}="${v}"`)
    .join(',');
  const key = `${name}{${labelStr}}`;
  metricsStore.set(key, (metricsStore.get(key) ?? 0) + 1);
}

export function handleMetricsRoute(_req: IncomingMessage, res: ServerResponse): void {
  const lines: string[] = [
    '# HELP mcp_requests_total Total number of MCP requests',
    '# TYPE mcp_requests_total counter',
  ];

  for (const [key, value] of metricsStore) {
    lines.push(`${key} ${value}`);
  }

  res.writeHead(200, {
    'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
  });
  res.end(lines.join('\n') + '\n');
}

export async function handleMcpRoute(
  _req: IncomingMessage,
  res: ServerResponse,
  server: McpServer
): Promise<void> {
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await server.connect(transport);
  await transport.handleRequest(_req, res);
}

export async function handleSseRoute(
  _req: IncomingMessage,
  res: ServerResponse,
  server: McpServer,
  sseTransports: Record<string, SSEServerTransport>
): Promise<void> {
  const sseTransport = new SSEServerTransport('/messages', res);
  sseTransports[sseTransport.sessionId] = sseTransport;
  res.on('close', () => {
    delete sseTransports[sseTransport.sessionId];
  });
  await server.connect(sseTransport);
}

export async function handleMessagesRoute(
  req: IncomingMessage,
  res: ServerResponse,
  sseTransports: Record<string, SSEServerTransport>
): Promise<void> {
  const sessionId =
    new URL(req.url || '', `http://${req.headers.host}`).searchParams.get('sessionId') ?? '';

  if (!sessionId) {
    res.writeHead(400);
    res.end('Missing sessionId parameter');
    return;
  }

  const sseTransport = sseTransports[sessionId];
  if (!sseTransport) {
    res.writeHead(400);
    res.end(`No transport found for sessionId: ${sessionId}`);
    return;
  }

  await sseTransport.handlePostMessage(req, res);
}

export function handlePingRoute(_req: IncomingMessage, res: ServerResponse): void {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('pong');
}

export function handleHealthRoute(
  _req: IncomingMessage,
  res: ServerResponse,
  transport: string
): void {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(
    JSON.stringify({
      status: 'healthy',
      name: 'context-awesome',
      version: '1.0.0',
      transport,
    })
  );
}
