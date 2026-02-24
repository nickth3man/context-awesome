import { createServer, IncomingMessage, ServerResponse } from "http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { getClientIp, extractBearerToken, extractHeaderValue } from "./utils.js";
import { createServerInstance } from "./mcp-server.js";
import { AppConfig } from "./config.js";

export function startHttpServer(config: AppConfig) {
  const initialPort = config.port ?? 3000;
  let actualPort = initialPort;
  const sseTransports: Record<string, SSEServerTransport> = {};

  const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url || "", `http://${req.headers.host}`).pathname;

    // Set CORS headers for all responses
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS,DELETE");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, MCP-Session-Id, MCP-Protocol-Version, X-Awesome-Context-API-Key, Awesome-Context-API-Key, X-API-Key, Authorization"
    );
    res.setHeader("Access-Control-Expose-Headers", "MCP-Session-Id");

    // Handle preflight OPTIONS requests
    if (req.method === "OPTIONS") {
      res.writeHead(200);
      res.end();
      return;
    }

    // Check headers in order of preference
    const apiKey =
      extractBearerToken(req.headers.authorization) ||
      extractHeaderValue(req.headers["Awesome-Context-API-Key"]) ||
      extractHeaderValue(req.headers["X-API-Key"]) ||
      extractHeaderValue(req.headers["context-awesome-api-key"]) ||
      extractHeaderValue(req.headers["x-api-key"]) ||
      extractHeaderValue(req.headers["Context_Awesome_API_Key"]) ||
      extractHeaderValue(req.headers["X_API_Key"]) ||
      extractHeaderValue(req.headers["context_awesome_api_key"]) ||
      extractHeaderValue(req.headers["x_api_key"]);

    try {
      // Extract client IP address using socket remote address (most reliable)
      const clientIp = getClientIp(req);

      // Create new server instance for each request
      const requestServer = createServerInstance(
        config.apiHost,
        config.debug,
        clientIp,
        apiKey
      );

      if (url === "/mcp") {
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
        });
        await requestServer.connect(transport);
        await transport.handleRequest(req, res);
      } else if (url === "/sse" && req.method === "GET") {
        // Create new SSE transport for GET request
        const sseTransport = new SSEServerTransport("/messages", res);
        // Store the transport by session ID
        sseTransports[sseTransport.sessionId] = sseTransport;
        // Clean up transport when connection closes
        res.on("close", () => {
          delete sseTransports[sseTransport.sessionId];
        });
        await requestServer.connect(sseTransport);
      } else if (url === "/messages" && req.method === "POST") {
        // Get session ID from query parameters
        const sessionId =
          new URL(req.url || "", `http://${req.headers.host}`).searchParams.get("sessionId") ??
          "";

        if (!sessionId) {
          res.writeHead(400);
          res.end("Missing sessionId parameter");
          return;
        }

        // Get existing transport for this session
        const sseTransport = sseTransports[sessionId];
        if (!sseTransport) {
          res.writeHead(400);
          res.end(`No transport found for sessionId: ${sessionId}`);
          return;
        }

        // Handle the POST message with the existing transport
        await sseTransport.handlePostMessage(req, res);
      } else if (url === "/ping") {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("pong");
      } else if (url === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            status: "healthy",
            name: "context-awesome",
            version: "1.0.0",
            transport: config.transport,
          })
        );
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
  });

  // Function to attempt server listen with port fallback
  const startServer = (port: number, maxAttempts = 10) => {
    httpServer.once("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE" && port < initialPort + maxAttempts) {
        console.warn(`Port ${port} is in use, trying port ${port + 1}...`);
        startServer(port + 1, maxAttempts);
      } else {
        console.error(`Failed to start server: ${err.message}`);
        process.exit(1);
      }
    });

    httpServer.listen(port, () => {
      actualPort = port;
      console.error(
        `Context Awesome MCP Server running on ${config.transport.toUpperCase()} at http://localhost:${actualPort}/mcp with SSE endpoint at /sse`
      );
    });
  };

  // Start the server with initial port
  startServer(initialPort);
}
