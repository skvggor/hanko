/**
 * Browsers always send Origin on a WebSocket handshake and on same origin
 * fetches, so a missing Origin is a non browser client. Refusing it costs nothing
 * for the app and removes the cross site WebSocket hijack, where any page could
 * open a socket into a room it learned the id of.
 *
 * Requests carrying no Origin at all are allowed: the app itself, curl and the
 * test suite legitimately make those, and they are not the browser vector.
 */
export function isAllowedOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");

  if (origin === null) return true;

  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false;
  }

  // Cloudflare forwards the public host, which is what the browser compared against.
  const host = request.headers.get("host");
  return host === null || originHost === host;
}