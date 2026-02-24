import { IncomingMessage } from "http";

export function getClientIp(req: IncomingMessage): string | undefined {
  // Check both possible header casings
  const forwardedFor = req.headers["x-forwarded-for"] || req.headers["X-Forwarded-For"];

  if (forwardedFor) {
    // X-Forwarded-For can contain multiple IPs
    const ips = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
    const ipList = ips.split(",").map((ip) => ip.trim());

    // Find the first public IP address
    for (const ip of ipList) {
      const plainIp = ip.replace(/^::ffff:/, "");
      if (
        !plainIp.startsWith("10.") &&
        !plainIp.startsWith("192.168.") &&
        !/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(plainIp)
      ) {
        return plainIp;
      }
    }
    // If all are private, use the first one
    return ipList[0].replace(/^::ffff:/, "");
  }

  // Fallback: use remote address, strip IPv6-mapped IPv4
  if (req.socket?.remoteAddress) {
    return req.socket.remoteAddress.replace(/^::ffff:/, "");
  }
  return undefined;
}

// Function to extract header value safely, handling both string and string[] cases
export function extractHeaderValue(value: string | string[] | undefined): string | undefined {
  if (!value) return undefined;
  return typeof value === "string" ? value : value[0];
}

// Extract Authorization header and remove Bearer prefix if present
export function extractBearerToken(
  authHeader: string | string[] | undefined
): string | undefined {
  const header = extractHeaderValue(authHeader);
  if (!header) return undefined;

  // If it starts with 'Bearer ', remove that prefix
  if (header.startsWith("Bearer ")) {
    return header.substring(7).trim();
  }

  // Otherwise return the raw value
  return header;
}
