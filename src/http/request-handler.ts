import { IncomingMessage, ServerResponse } from "http";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { AppConfig } from "../config.js";
import { getClientIp } from "../utils.js";
import { createServerInstance } from "../mcp-server.js";
import { setCorsHeaders, extractApiKey } from "./middleware.js";
import { RateLimiterMemory } from "rate-limiter-flexible";
import {
  handleMcpRoute,
  handleSseRoute,
  handleMessagesRoute,
  handlePingRoute,
  handleHealthRoute,
  handleMetricsRoute,
  incrementMetric,
} from "./routes.js";

export function createRequestHandler(
  config: AppConfig,
  sseTransports: Record<string, SSEServerTransport>
) {
  const rateLimiter = new RateLimiterMemory({
    points: 60,
    duration: 60,
  });

  return async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url || "", `http://${req.headers.host}`).pathname;

    setCorsHeaders(res);

    if (req.method === "OPTIONS") {
      res.writeHead(200);
      res.end();
      return;
    }

    const clientIp = getClientIp(req);

    const exemptPaths = ["/health", "/ping", "/metrics"];
    if (!exemptPaths.includes(url)) {
      try {
        await rateLimiter.consume(clientIp ?? "unknown");
      } catch (rateLimiterRes: unknown) {
        const msBeforeNext =
          rateLimiterRes &&
          typeof rateLimiterRes === "object" &&
          "msBeforeNext" in rateLimiterRes &&
          typeof (rateLimiterRes as { msBeforeNext: number }).msBeforeNext ===
            "number"
            ? (rateLimiterRes as { msBeforeNext: number }).msBeforeNext
            : 60_000;
        const retryAfter = Math.ceil(msBeforeNext / 1000);
        res.writeHead(429, { "Retry-After": String(retryAfter) });
        res.end("Too Many Requests");
        return;
      }
    }

    const apiKey = extractApiKey(req);
    try {
      const requestServer = createServerInstance(
        config.apiHost,
        config.debug,
        clientIp,
        apiKey
      );

      if (url === "/mcp") {
        incrementMetric("mcp_requests_total", { tool: "mcp", status: "attempt" });
        await handleMcpRoute(req, res, requestServer);
        incrementMetric("mcp_requests_total", { tool: "mcp", status: "success" });
      } else if (url === "/sse" && req.method === "GET") {
        incrementMetric("mcp_requests_total", { tool: "sse", status: "attempt" });
        await handleSseRoute(req, res, requestServer, sseTransports);
        incrementMetric("mcp_requests_total", { tool: "sse", status: "success" });
      } else if (url === "/messages" && req.method === "POST") {
        incrementMetric("mcp_requests_total", { tool: "messages", status: "attempt" });
        await handleMessagesRoute(req, res, sseTransports);
        incrementMetric("mcp_requests_total", { tool: "messages", status: "success" });
      } else if (url === "/ping") {
        handlePingRoute(req, res);
      } else if (url === "/health") {
        handleHealthRoute(req, res, config.transport);
      } else if (url === "/metrics") {
        handleMetricsRoute(req, res);
      } else {
        res.writeHead(404);
        res.end("Not found");
      }
    } catch (error) {
      incrementMetric("mcp_requests_total", { tool: url.slice(1) || "unknown", status: "error" });
      console.error("Error handling request:", error);
      if (!res.headersSent) {
        res.writeHead(500);
        res.end("Internal Server Error");
      }
    }
  };
}
