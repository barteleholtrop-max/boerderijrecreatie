import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {HttpError, insist, openStore, readBoard} from './store.mjs';
import {ownerAPI} from './owner-api.mjs';
import {loopbackAlias} from './local-access.mjs';
import {injectSeo, icsCalendar, llmsTxt, robotsTxt, sitemapXml} from './seo.mjs';

const assets = path.dirname(fileURLToPath(import.meta.url));
function send(res, status, body, type = 'application/json; charset=utf-8', headers = {}) {
  res.writeHead(status, {'Content-Type': type, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store', ...headers});
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}
async function body(req, max = 4 * 1024 * 1024 + 32768) {
  insist((req.headers['content-type'] || '').split(';')[0] === 'application/json', 415, 'Verstuur JSON.');
  const chunks = []; let length = 0, oversized = false;
  for await (const chunk of req) {
    length += chunk.length;
    if (length > max) { oversized = true; chunks.length = 0; }
    if (!oversized) chunks.push(chunk);
  }
  insist(!oversized, 413, 'Het voorstel of de afbeelding is te groot.');
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new HttpError(400, 'Ongeldige JSON.'); }
}

// Read-only forwarding of the backoffice's public data (products, opening hours, Ite by Boer Bart moments) so the website
// can use the central source on its own origin. Only these two paths and only GET/HEAD; no cookies or headers are passed on.
const publicDataPaths = ['/api/public/abonnementen', '/api/public/products', '/api/public/availability', '/api/public/weekmenu'];
// Photos of published products (backoffice decides which); only GET, only image types, at most 10 MB.
const publicMediaPath = /^\/api\/public\/media\/[a-f0-9-]{36}$/;
const IMAGE_TYPES = /^image\/(jpeg|png|webp|gif|avif)$/;
async function forwardPublicMedia(res, base, pathname, method) {
  if (!base) return send(res, 503, 'Niet beschikbaar.', 'text/plain; charset=utf-8', {'Cache-Control': 'no-store'});
  try {
    const response = await fetch(new URL(pathname, base), {redirect: 'error', signal: AbortSignal.timeout(10000)});
    const type = (response.headers.get('content-type') || '').split(';')[0].trim();
    if (response.status !== 200 || !IMAGE_TYPES.test(type)) return send(res, 404, 'Niet gevonden.', 'text/plain; charset=utf-8', {'Cache-Control': 'no-store'});
    const data = Buffer.from(await response.arrayBuffer());
    if (data.length > 10 * 1024 * 1024) return send(res, 404, 'Niet gevonden.', 'text/plain; charset=utf-8', {'Cache-Control': 'no-store'});
    return send(res, 200, method === 'HEAD' ? '' : data, type, {'Cache-Control': 'public, max-age=300', 'X-Content-Type-Options': 'nosniff'});
  } catch { return send(res, 503, 'Niet beschikbaar.', 'text/plain; charset=utf-8', {'Cache-Control': 'no-store'}); }
}
async function forwardPublicData(res, base, pathname, method) {
  const unavailable = () => send(res, 503, {error: 'De gegevens uit de backoffice zijn nu niet beschikbaar.'}, undefined, {'Cache-Control': 'no-store'});
  if (!base) return unavailable();
  try {
    const response = await fetch(new URL(pathname, base), {redirect: 'error', signal: AbortSignal.timeout(5000), headers: {accept: 'application/json'}});
    const text = await response.text();
    if (![200, 503].includes(response.status) || text.length > 2000000) return unavailable();
    JSON.parse(text);
    return send(res, response.status, method === 'HEAD' ? '' : text, 'application/json; charset=utf-8', {'Cache-Control': response.status === 200 && pathname !== '/api/public/abonnementen' ? 'public, max-age=60' : 'no-store', 'X-Content-Type-Options': 'nosniff'});
  } catch { return unavailable(); }
}

// One shared UI/theme asset source for website and backoffice, no duplicate ledger or balances.
const bloeiAssets=new Set(['/brand.css','/bloei-proef.css','/bloei-proef.js']);
async function forwardBloei(req,res,url,base,origin){
 if(!['GET','POST'].includes(req.method))return send(res,405,{error:'Methode niet toegestaan.'});
 if(req.method==='POST'&&(req.headers.origin!==origin||req.headers['sec-fetch-site']==='cross-site'))return send(res,403,{error:'Ongeldige herkomst.'});
 if(!base)return send(res,503,{error:'Bloei is niet beschikbaar.'});
 try{
  let raw;
  if(req.method==='POST')raw=JSON.stringify(await body(req,5000));
  const target=new URL('/api/public/bloei',base);target.search=url.search;
  const response=await fetch(target,{method:req.method,headers:{accept:'application/json','Content-Type':'application/json',origin:base},body:raw,redirect:'error',signal:AbortSignal.timeout(5000)});
  const data=await response.text();if(data.length>2000000)throw Error('Te groot');JSON.parse(data);
  return send(res,response.status,data,'application/json; charset=utf-8',{'Cache-Control':'private, no-store'});
 }catch(e){return send(res,e instanceof HttpError?e.status:503,{error:e instanceof HttpError?e.message:'Bloei is niet beschikbaar.'});}
}

// Vindbaarheid (4 november 2026): openingstijden, adres en agenda uit de backoffice, hooguit één keer per minuut opgehaald.
// Lukt ophalen niet, dan gaat de pagina gewoon zonder deze extra gegevens de deur uit (nooit oude of geraden tijden in de feed).
function availabilityCache(base) {
  let hit = null;
  return async () => {
    if (hit && Date.now() - hit.at < 60000) return hit.data;
    if (!base) return null;
    try {
      const r = await fetch(new URL('/api/public/availability', base), {redirect: 'error', signal: AbortSignal.timeout(4000), headers: {accept: 'application/json'}});
      if (r.status !== 200) return null;
      const data = JSON.parse(await r.text());
      hit = {at: Date.now(), data};
      return data;
    } catch { return null; }
  };
}

export function createWebsiteServer(options) {
  const root = fs.realpathSync(options.root), devMode = options.devMode === true;
  const originUrl = new URL(options.origin || 'http://localhost:3002');
  const backofficeOrigin = options.backofficeOrigin ? new URL(options.backofficeOrigin) : null;
  insist(!backofficeOrigin || (['http:', 'https:'].includes(backofficeOrigin.protocol) && backofficeOrigin.pathname === '/' && !backofficeOrigin.search && !backofficeOrigin.username && !backofficeOrigin.password), 500, 'BACKOFFICE_ORIGIN moet een oorsprong zijn, zonder pad of aanmeldgegevens.');
  insist(['http:', 'https:'].includes(originUrl.protocol) && originUrl.pathname === '/' && !originUrl.search && !originUrl.hash && !originUrl.username && !originUrl.password, 500, 'WEBSITE_ORIGIN moet een oorsprong zijn, zonder pad of aanmeldgegevens.');
  if (devMode) {
    insist(originUrl.protocol === 'https:' || ['localhost', '127.0.0.1', '[::1]'].includes(originUrl.hostname), 500, 'Gebruik HTTPS buiten localhost voor de ontwikkelfuncties.');
    const dir = path.resolve(options.dataDir);
    insist(dir !== root && !dir.startsWith(root + path.sep), 500, 'Bewaar voorstellen buiten de publieke websitemap.');
  }
  const store = devMode ? openStore(options.dataDir) : null;
  if (devMode) {
    const dir = fs.realpathSync(options.dataDir);
    if (dir === root || dir.startsWith(root + path.sep)) { store.close(); throw new HttpError(500, 'Bewaar voorstellen buiten de publieke websitemap.'); }
  }
  // No login on the website's development tools (besluit eigenaar 3 november 2026): the login card, the log-out button and
  // any password are gone. These tools only exist in development mode and never run live; when going live the owner
  // signs in with Google (still to be built), not with a self-built login.
  const board = () => readBoard(options);
  const availability = availabilityCache(backofficeOrigin?.origin);
  const server = http.createServer(async (req, res) => {
    try {
      const origin = originUrl.port === '0' ? `${originUrl.protocol}//${originUrl.hostname}:${server.address().port}` : originUrl.origin;
      const url = new URL(req.url, origin);
      const privatePath = url.pathname === '/__dev' || url.pathname.startsWith('/__dev/');
      const hostMatches = req.headers.host === new URL(origin).host;
      // Same computer under another name (127.0.0.1 <-> localhost): go to the configured address, so no login prompt appears.
      const alias = devMode && loopbackAlias({enabled: options.localNoLogin, origin, host: req.headers.host, method: req.method, header: n => req.headers[n]});
      if (alias) { res.writeHead(307, {Location: alias + url.pathname + url.search, 'Cache-Control': 'no-store'}); return res.end(); }
      const authorized = devMode && hostMatches;
      const actor = options.username || 'eigenaar';
      const proposalId = url.searchParams.get('voorstel');
      if (privatePath) {
        insist(devMode, 404, 'Niet gevonden.');
        insist(hostMatches, 403, 'Open de website via de ingestelde WEBSITE_ORIGIN.');
        if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
          insist(req.headers.origin === origin && req.headers['sec-fetch-site'] !== 'cross-site', 403, 'Ongeldige herkomst.');
        }
        // Old links to /__dev/login (bookmarks, proposal links) simply go back to the site.
        if (req.method === 'GET' && url.pathname === '/__dev/login') {
          const next = proposalId && /^[a-f0-9-]{36}$/i.test(proposalId) ? '/?voorstel=' + encodeURIComponent(proposalId) : '/';
          res.writeHead(303, {Location: next, 'Cache-Control': 'no-store'}); return res.end();
        }
        const response = await ownerAPI({pathname: url.pathname, method: req.method,
          parse: () => body(req), store, actor, application: 'website', origin, board, assetsDir: assets, github: options.github, version: options.version});
        return send(res, response.status, Buffer.from(await response.arrayBuffer()), response.headers.get('content-type'), Object.fromEntries(response.headers));
      }
      if(url.pathname==='/api/public/bloei'||url.pathname==='/api/public/bloei-proef')return forwardBloei(req,res,url,backofficeOrigin?.origin,origin);
      if(url.pathname==='/abonnementen.html'&&['GET','HEAD'].includes(req.method)){return send(res,200,req.method==='HEAD'?'':fs.readFileSync(path.resolve(root,'../backoffice/public/abonnementen.html')),'text/html; charset=utf-8',{'Cache-Control':'no-store'});}
      if((url.pathname==='/api/public/abonnementen'&&['POST','OPTIONS'].includes(req.method))||(url.pathname==='/api/public/payments'&&['GET','POST','OPTIONS'].includes(req.method))){
        if(req.method==='POST'&&req.headers.origin!==origin)return send(res,403,{error:'Ongeldige herkomst.'});
        if(!backofficeOrigin)return send(res,503,{error:'Niet beschikbaar.'});
        const raw=req.method==='POST'?JSON.stringify(await body(req,10000)):undefined;
        const upstream=await fetch(new URL(url.pathname+url.search,backofficeOrigin.origin),{method:req.method,headers:{'Content-Type':'application/json',Origin:origin},body:raw,redirect:'error',signal:AbortSignal.timeout(15000)});
        return send(res,upstream.status,req.method==='OPTIONS'?'':await upstream.text(),'application/json; charset=utf-8',{'Cache-Control':'no-store'});
      }
      if(bloeiAssets.has(url.pathname)&&['GET','HEAD'].includes(req.method)){
        const asset=path.resolve(root,'../backoffice/public',url.pathname.slice(1));
        const type=url.pathname.endsWith('.js')?'text/javascript; charset=utf-8':'text/css; charset=utf-8';
        return send(res,200,req.method==='HEAD'?'':fs.readFileSync(asset),type);
      }
      insist(req.method === 'GET' || req.method === 'HEAD', 405, 'Methode niet toegestaan.');
      if (publicDataPaths.includes(url.pathname)) return forwardPublicData(res, backofficeOrigin?.origin, url.pathname, req.method);
      // Vindbaarheid voor zoekmachines en AI, en de agendafeed (zie seo.mjs).
      const head = req.method === 'HEAD';
      if (url.pathname === '/robots.txt') return send(res, 200, head ? '' : robotsTxt(origin), 'text/plain; charset=utf-8', {'Cache-Control': 'public, max-age=3600'});
      if (url.pathname === '/sitemap.xml') return send(res, 200, head ? '' : sitemapXml(origin, new Date().toISOString().slice(0, 10)), 'application/xml; charset=utf-8', {'Cache-Control': 'public, max-age=3600'});
      if (url.pathname === '/llms.txt' || url.pathname === '/agenda.ics') {
        const av = await availability();
        if (!av) return send(res, 503, 'De gegevens zijn nu even niet beschikbaar. Probeer het later opnieuw.', 'text/plain; charset=utf-8');
        return url.pathname === '/llms.txt'
          ? send(res, 200, head ? '' : llmsTxt(av, origin), 'text/plain; charset=utf-8', {'Cache-Control': 'public, max-age=300'})
          : send(res, 200, head ? '' : icsCalendar(av, origin), 'text/calendar; charset=utf-8', {'Cache-Control': 'public, max-age=900', 'Content-Disposition': 'inline; filename="boer-bart-agenda.ics"'});
      }
      if (publicMediaPath.test(url.pathname) && ['GET', 'HEAD'].includes(req.method)) return forwardPublicMedia(res, backofficeOrigin?.origin, url.pathname, req.method);
      let pathname;
      try { pathname = decodeURIComponent(url.pathname); } catch { throw new HttpError(400, 'Ongeldig pad.'); }
      insist(!pathname.split('/').some(p => p.startsWith('.') || p === 'var') && !pathname.includes('\\') && !pathname.includes('\0'), 404, 'Niet gevonden.');
      let file = path.resolve(root, '.' + pathname);
      insist(file === root || file.startsWith(root + path.sep), 404, 'Niet gevonden.');
      insist(fs.existsSync(file), 404, 'Niet gevonden.');
      if (fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
      insist(fs.existsSync(file), 404, 'Niet gevonden.');
      file = fs.realpathSync(file);
      insist(file.startsWith(root + path.sep) && fs.statSync(file).isFile(), 404, 'Niet gevonden.');
      const ext = path.extname(file);
      const types = {'.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.woff2': 'font/woff2'};
      let data = fs.readFileSync(file);
      if (ext === '.html' && authorized) data = data.toString().replace(/<\/body>/i, '<script src="/__dev/client.js" defer></script></body>');
      // Startpagina: gestructureerde gegevens en een tekstsamenvatting uit de backoffice, voor zoekmachines en AI.
      if (path.basename(file) === 'index.html' && path.dirname(file) === root) { const av = await availability(); if (av) data = injectSeo(data.toString(), av, origin); }
      return send(res, 200, req.method === 'HEAD' ? '' : data, types[ext] || 'application/octet-stream', authorized ? {'Content-Security-Policy': "frame-ancestors 'none'"} : {});
    } catch (error) {
      if (res.headersSent || res.destroyed) return;
      send(res, error instanceof HttpError ? error.status : 500, {error: error instanceof HttpError ? error.message : 'De lokale opslag of het planbord is niet beschikbaar. Probeer opnieuw; je invoer blijft in het venster staan.'});
    }
  });
  server.on('close', () => { options.version?.stop(); store?.close(); });
  server.requestTimeout = 30000;
  return server;
}
