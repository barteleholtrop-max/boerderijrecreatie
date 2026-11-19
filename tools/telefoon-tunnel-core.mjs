// Telefoonstand: the backoffice reachable on a phone through a temporary Cloudflare quick tunnel.
// Same approach as tools/cloudflare-review-core.mjs on the kassa branch (website + guest ordering); merge the two
// when that branch lands. The backoffice is exposed with its normal login. Besides that, only the guest order page
// (besluit eigenaar 2 november 2026: zonder login, zoals een gast) comes from the website server; nothing else of the website.
import http from 'node:http';

/** The quick-tunnel address in cloudflared's output; its own API address (api.trycloudflare.com) is skipped. */
export function publicTunnelOrigin(text) {
  for (const m of text.matchAll(/https:\/\/([a-z0-9]+(?:-[a-z0-9]+)*)\.trycloudflare\.com\b/gi)) if (m[1].toLowerCase() !== 'api') return m[0].toLowerCase();
  return null;
}
const HMR = ['/_next/hmr', '/_next/webpack-hmr'];
// Static files of the guest order page (apps/website/bestellen.*). Read-only (GET/HEAD); everything else goes to the backoffice.
export const GUEST_PAGE = new Set(['/bestellen.html', '/bestellen.css', '/bestellen.js', '/bestellen-sw.js', '/bestellen-app.json', '/zelfkassa-app.json', '/beeld/boerbart-logo.webp']);
export function guestPagePath(method, url) {
  if (method !== 'GET' && method !== 'HEAD') return null;
  let pathname; try { pathname = new URL(url, 'http://localhost').pathname; } catch { return null; }
  if (pathname === '/bestellen') return '/bestellen.html';
  return GUEST_PAGE.has(pathname) ? pathname : null;
}

/**
 * Gateway between cloudflared and the backoffice. It always sets Host to the tunnel's own host, so the backoffice
 * never mistakes tunnel traffic for "this computer" (no-login on localhost), whatever Host cloudflared passes on.
 * Every other header (including Cloudflare's cf-* headers and the browser's Origin) is passed through unchanged.
 */
export function createPhoneGateway({backofficePort = 3001, websitePort = null, getPublicOrigin}) {
  const server = http.createServer((req, res) => {
    const origin = getPublicOrigin();
    if (!origin) { res.writeHead(503, {'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store'}); return res.end('De telefoonstand start nog. Probeer het over een paar seconden opnieuw.'); }
    // The guest page goes to the website server with the tunnel's Host and without cookies or login headers,
    // so the website never treats it as the owner on this computer (no developer tools, no "geen login op localhost").
    const guest = websitePort ? guestPagePath(req.method, req.url) : null;
    const headers = guest ? {host: new URL(origin).host, accept: req.headers.accept || '*/*', 'user-agent': req.headers['user-agent'] || '', 'cf-connecting-ip': req.headers['cf-connecting-ip'] || 'telefoonstand'}
      : {...req.headers, host: new URL(origin).host};
    const upstream = http.request({hostname: '127.0.0.1', port: guest ? websitePort : backofficePort, path: guest || req.url, method: req.method, headers}, incoming => {
      res.writeHead(incoming.statusCode || 502, incoming.headers); incoming.pipe(res);
    });
    upstream.setTimeout(120000, () => upstream.destroy());
    upstream.on('error', () => { if (!res.headersSent) res.writeHead(502, {'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store'}); res.end('De backoffice is nog niet gereed of is gestopt. Kijk in de terminal op de Chromebook.'); });
    req.on('aborted', () => upstream.destroy()); res.on('close', () => upstream.destroy()); req.pipe(upstream);
  });
  // Only Next's own development socket, and only from the tunnel's page, is forwarded; other upgrades are refused.
  const sockets = new Set(); const close = server.closeAllConnections.bind(server);
  server.closeAllConnections = () => { for (const s of sockets) s.destroy(); close(); };
  server.on('upgrade', (req, socket, head) => {
    sockets.add(socket); socket.on('close', () => sockets.delete(socket));
    const origin = getPublicOrigin();
    let pathname; try { pathname = new URL(req.url, 'http://localhost').pathname; } catch { return socket.destroy(); }
    if (!origin || !HMR.includes(pathname) || req.headers.origin !== origin) return socket.destroy();
    const upstream = http.request({hostname: '127.0.0.1', port: backofficePort, path: req.url, headers: {...req.headers, host: new URL(origin).host}});
    upstream.on('upgrade', (response, stream, first) => {
      socket.write(`HTTP/1.1 ${response.statusCode} ${response.statusMessage}\r\n` + Object.entries(response.headers).map(([k, v]) => `${k}: ${v}`).join('\r\n') + '\r\n\r\n');
      if (first.length) socket.write(first); if (head.length) stream.write(head);
      socket.pipe(stream).pipe(socket); stream.on('error', () => socket.destroy()); socket.on('error', () => stream.destroy()); socket.on('close', () => stream.destroy());
    });
    upstream.on('response', () => socket.destroy()); upstream.on('error', () => socket.destroy()); upstream.end();
  });
  return server;
}
