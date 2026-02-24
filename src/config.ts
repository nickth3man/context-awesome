import { Command } from "commander";

export const DEFAULT_MINIMUM_TOKENS = 10000;

export interface AppConfig {
  transport: "stdio" | "http";
  port?: number;
  apiHost: string;
  apiKey?: string;
  debug: boolean;
}

export function parseConfig(argv: string[]): AppConfig {
  const program = new Command()
    .option("--transport <stdio|http>", "transport type", "stdio")
    .option("--port <number>", "port for HTTP transport", "3000")
    .option(
      "--api-host <url>",
      "Backend API host URL",
      process.env.AWESOME_CONTEXT_API_HOST || "https://api.context-awesome.com"
    )
    .option("--api-key <key>", "API key for authentication")
    .option("--debug", "Enable debug logging")
    .allowUnknownOption() // let MCP Inspector / other wrappers pass through extra flags
    .parse(argv);

  const cliOptions = program.opts<{
    transport: string;
    port: string;
    apiHost: string;
    apiKey?: string;
    debug?: boolean;
  }>();

  // Validate transport option
  const allowedTransports = ["stdio", "http"];
  if (!allowedTransports.includes(cliOptions.transport)) {
    console.error(
      `Invalid --transport value: '${cliOptions.transport}'. Must be one of: stdio, http.`
    );
    process.exit(1);
  }

  const transport = (cliOptions.transport || "stdio") as "stdio" | "http";

  // Disallow incompatible flags based on transport
  const passedPortFlag = argv.includes("--port");
  const passedApiKeyFlag = argv.includes("--api-key");

  if (transport === "http" && passedApiKeyFlag) {
    console.error(
      "The --api-key flag is not allowed when using --transport http. Use header-based auth at the HTTP layer instead."
    );
    process.exit(1);
  }

  if (transport === "stdio" && passedPortFlag) {
    console.error("The --port flag is not allowed when using --transport stdio.");
    process.exit(1);
  }

  // HTTP port configuration
  const port = (() => {
    const parsed = parseInt(cliOptions.port, 10);
    return isNaN(parsed) ? undefined : parsed;
  })();

  return {
    transport,
    port,
    apiHost: cliOptions.apiHost,
    apiKey: cliOptions.apiKey,
    debug: !!cliOptions.debug,
  };
}
