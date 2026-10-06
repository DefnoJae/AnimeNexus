import http from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';

const root = process.env.NEXUS_RESOLVER_PATH;
if (!root) throw new Error('Set NEXUS_RESOLVER_PATH to your local anime-nexus-hls-stream-resolver folder. See README.');
const load = name => import(pathToFileURL(path.resolve(root, 'lib', name)).href);
const [{ httpClient, fetchJson }, { solveCloudflare }, proxy] = await Promise.all([load('net/fetch.mjs'), load('cf/solve.mjs'), load('core/proxy.mjs')]);
const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
const origin = `http://127.0.0.1:${port}`;
let client, expires = 0, preparing;
async function api(route) {
    const url = 'https://api.anime.nexus' + route;
    if (!client || Date.now() >= expires) {
        if (!preparing) preparing = (async () => {
            const candidate = httpClient();
            await solveCloudflare(url, candidate);
            client = candidate;
            expires = Date.now() + 20 * 60 * 1000;
        })().finally(() => { preparing = undefined; });
        await preparing;
    }
    const fingerprint = randomUUID();
    const { res, data } = await fetchJson(client, url, { headers: { Origin: 'https://anime.nexus', Referer: 'https://anime.nexus/', Accept: 'application/json', 'X-Fingerprint': fingerprint, 'X-Client-Fingerprint': fingerprint } });
    if (!res.ok) { expires = 0; throw new Error(`Catalogue HTTP ${res.status}`); }
    return data;
}
const server = http.createServer(async (req, res) => {
    const json = (status, data) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); };
    try {
        const url = new URL(req.url, origin);
        if (req.method !== 'GET') return json(405, { error: 'GET required' });
        if (url.pathname === '/health') return json(200, { ready: true });
        if (url.pathname === '/api/catalogue') {
            const route = url.searchParams.get('path') || '';
            if (!/^\/api\/anime\/(?:shows|details\/episodes)\?/.test(route) || /[\r\n#]/.test(route)) return json(400, { error: 'Unsupported catalogue route' });
            return json(200, await api(route));
        }
        if (url.pathname === '/api/resolve') {
            const watch = url.searchParams.get('url');
            if (!/^https:\/\/anime\.nexus\/watch\/[a-f0-9-]{36}(?:\/[^?#]*)?$/.test(watch || '')) return json(400, { error: 'Invalid watch URL' });
            const session = await proxy.openSession(watch);
            return json(200, { playUrl: `${origin}/play/${session.playId}/master.m3u8` });
        }
        const master = url.pathname.match(/^\/play\/([a-f0-9-]{36})\/master\.m3u8$/);
        if (master) { const body = await proxy.serveMaster(master[1], origin); res.writeHead(200, { 'Content-Type': 'application/vnd.apple.mpegurl' }); return res.end(body); }
        const cdn = url.pathname.match(/^\/play\/([a-f0-9-]{36})\/x\/([^/]+)(\/.*)$/);
        if (cdn) {
            if (!/^(?:[a-z0-9-]+\.)*(?:cdn\.nexus|anime\.delivery|anime\.nexus)$/i.test(cdn[2])) return json(400, { error: 'Invalid Nexus CDN host' });
            const upstream = `https://${cdn[2]}${cdn[3]}${url.search}`;
            if (cdn[3].endsWith('.m3u8')) { const data = await proxy.servePlaylist(cdn[1], origin, upstream); res.writeHead(200, { 'Content-Type': data.contentType }); return res.end(data.buffer); }
            return await proxy.pipeCdn(cdn[1], upstream, res);
        }
        return json(404, { error: 'Not found' });
    } catch (error) {
        console.error('Nexus helper failure:', error.code || error.name || 'Error');
        if (res.headersSent) return res.destroy();
        return json(502, { error: 'Resolver verification failed. Check certificate trust, resolver dependencies and JSDCTL_PATH.' });
    }
});
server.listen(port, '127.0.0.1', () => console.log(`Anime Nexus helper listening at ${origin}`));
