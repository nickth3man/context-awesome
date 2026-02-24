import { IncomingMessage, ServerResponse } from "http";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { AppConfig } from "../config.js";
import { getClientIp } from "../utils.js";
import { createServerInstance } from "../mcp-server.js";
import { setCorsHeaders, extractApiKey } from "./middleware.js";
import {
  handleMcpRoute,
  handleSseRoute,
  handleMessagesRoute,
  handlePingRoute,
  handleHealthRoute,
} from "./routes.js";

export function createRequestHandler(
  config: AppConfig,
  sseTransports: Record<string, SSEServerTransport>
) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url || "", `http://${req.headers.host}`).pathname;

    setCorsHeaders(res);

    if (req.method === "OPTIONS") {
      res.writeHead(200);
      res.end();
      return;
    }

    const apiKey = extractApiKey(req);

    try {
      const clientIp = getClientIp(req);
      const requestServer = createServerInstance(
        config.apiHost,
        config.debug,
        clientIp,
        apiKey
      );

      if (url === "/mcp") {
        await handleMcpRoute(req, res, requestServer);
      } else if (url === "/sse" && req.method === "GET") {
        await handleSseRoute(req, res, requestServer, sseTransports);
      } else if (url === "/messages" && req.method === "POST") {
        await handleMessagesRoute(req, res, sseTransports);
      } else if (url === "/ping") {
        handlePingRoute(req, res);
      } else if (url === "/health") {
        handleHealthRoute(req, res, config.transport);
      } else {
        res.writeHead(404);
        res.end("Not found");
      }
    } catch (error) {
      console.error("Error handling request:", error);
      if (!res.headersSent) {
        res.writeHead(500);
        res.end("Internal Server Error");
      }
    }
  };
}
