import { IncomingMessage, ServerResponse } from 'http';
import { extractBearerToken, extractHeaderValue } from '../utils.js';

export function setCorsHeaders(res: ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS,DELETE');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, MCP-Session-Id, MCP-Protocol-Version, X-Awesome-Context-API-Key, Awesome-Context-API-Key, X-API-Key, Authorization'
  );
  res.setHeader('Access-Control-Expose-Headers', 'MCP-Session-Id');
}

export function extractApiKey(req: IncomingMessage): string | undefined {
  return (
    extractBearerToken(req.headers.authorization) ||
    extractHeaderValue(req.headers['Awesome-Context-API-Key']) ||
    extractHeaderValue(req.headers['X-API-Key']) ||
    extractHeaderValue(req.headers['context-awesome-api-key']) ||
    extractHeaderValue(req.headers['x-api-key']) ||
    extractHeaderValue(req.headers['Context_Awesome_API_Key']) ||
    extractHeaderValue(req.headers['X_API_Key']) ||
    extractHeaderValue(req.headers['context_awesome_api_key']) ||
    extractHeaderValue(req.headers['x_api_key'])
  );
}
