import { createServer } from "http";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { AppConfig } from "./config.js";
import { createRequestHandler } from "./http/request-handler.js";

export function startHttpServer(config: AppConfig) {
  const initialPort = config.port ?? 3000;
  let actualPort = initialPort;
  const sseTransports: Record<string, SSEServerTransport> = {};

  const httpServer = createServer(createRequestHandler(config, sseTransports));

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
