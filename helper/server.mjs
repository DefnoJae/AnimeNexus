import http from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createGateway } from './gateway.mjs';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { installTransport, setBrowserMetadata } from './transport.mjs';
import { createVerificationBroker } from './verification.mjs';
const verification = createVerificationBroker();

const bundledParser = fileURLToPath(new URL('./bin/jsdctl.exe', import.meta.url));
if (process.platform === 'win32' && !process.env.JSDCTL_PATH && existsSync(bundledParser)) process.env.JSDCTL_PATH = bundledParser;

const root = process.env.NEXUS_RESOLVER_PATH;
if (!root) throw new Error('Set NEXUS_RESOLVER_PATH to your local anime-nexus-hls-stream-resolver folder. See README.');
const closeTransport = installTransport(root);
const load = name => import(pathToFileURL(path.resolve(root, 'lib', name)).href);
const [{ httpClient, fetchBytes }, { solveCloudflare }, { rewritePlaylist }, { signUrl, pickStream }, { VideoSocket }, { streamApiUrl }, { parseWatchUrl }] = await Promise.all([load('net/fetch.mjs'), load('cf/solve.mjs'), load('hls/playlist.mjs'), load('nexus/stream.mjs'), load('net/socket.mjs'), load('nexus/site.mjs'), load('nexus/watch.mjs')]);
async function atStage(stage, action) { try { return await action(); } catch (error) { error.stage = stage; error.code ||= ['could not find __CF$cv$params', 'page loaded without challenge params and no cf_clearance', 'JSD oneshot did not return cf_clearance', 'Catalogue response was not JSON'].find(message => error.message?.includes(message)); if (stage === 'socket authorization' && /^[A-Za-z _.,:!?()-]{1,160}$/.test(error.message || '')) error.code ||= error.message; throw error; } }
async function resolvePlayback(input) {
    const { episodeId, watchUrl } = parseWatchUrl(input);
    const verified = verification.get(episodeId);
    const fingerprint = verified?.fingerprint || `${randomUUID()}:${randomUUID()}`;
    const streamUrl = new URL(streamApiUrl(episodeId));
    const meta = await atStage('stream metadata', () => api(streamUrl.pathname + streamUrl.search, fingerprint));
    await atStage('watch verification', () => solveCloudflare(watchUrl, client));
    const attestation = verified?.attestation || await atStage('playback attestation', () => fetchAttestation(episodeId, fingerprint, watchUrl));
    const stream = pickStream(meta);
    const socket = new VideoSocket({ episodeId, fingerprint, m3u8Url: stream.url, client, watchUrl, attestation });
    try { await atStage('socket authorization', () => socket.connect()); }
    catch (error) { socket.close(); throw error; }
    return { socket, http: client, episodeId, videoId: stream.videoId, watchUrl, masterUrl: stream.url };
}
async function fetchAttestation(episodeId, fingerprint, watchUrl) {
    const url = 'https://anime.nexus/api/auth/ws-token';
    const headers = { 'Content-Type': 'application/json', Origin: 'https://anime.nexus', Referer: watchUrl, 'X-Client-Fingerprint': fingerprint, 'X-Fingerprint': fingerprint, 'Sec-Fetch-Dest': 'empty', 'Sec-Fetch-Mode': 'cors', 'Sec-Fetch-Site': 'same-origin' };
    const base = { videoId: episodeId, fingerprint, purpose: 'init' };
    async function post(body) {
        const options = { headers, data: JSON.stringify(body) };
        let result = await client.post(url, options);
        if (result.buffer().includes('__CF$cv$params')) {
            let first = true;
            await solveCloudflare(url, {
                get: (target, options) => { if (first && target === url) { first = false; return Promise.resolve(result); } return client.get(target, options); },
                post: (target, options) => client.post(target, options),
                exportCookies: () => client.exportCookies(),
            });
            result = await client.post(url, options);
        }
        return result;
    }
    const prepared = await post({ ...base, prepareViewer: true });
    if (!prepared.ok) { const error = new Error('Viewer preparation failed'); error.code = 'VIEWER_HTTP_' + prepared.status; throw error; }
    let result = await post(base);
    let data; try { data = result.json(); } catch { throw new Error('Invalid attestation response'); }
    if (data.code === 'TURNSTILE_REQUIRED') {
        result = await post({ ...base, requestVerificationFallback: true });
        try { data = result.json(); } catch { throw new Error('Invalid fallback response'); }
    }
    if (data.code === 'FALLBACK_REQUIRED' && data.fallback?.provider === 'private-captcha') {
        const fallback = data.fallback;
        const id = verification.create({ episodeId, fingerprint, fallback, client, submit: async (solution, metadata) => {
            const response = await post({ ...base, fallbackTicket: fallback.ticket, fallbackPayload: solution });
            let proof; try { proof = response.json(); } catch { throw new Error('Invalid verification response'); }
            if (!response.ok || !proof.refId || !proof.wireSecret) throw new Error('Playback verification rejected');
            if (metadata) setBrowserMetadata(fingerprint, metadata);
            const expiresAt = Number.isFinite(proof.wireExp) ? (proof.wireExp < 1e12 ? proof.wireExp * 1000 : proof.wireExp) : Date.now() + 60000;
            return { ref: proof.refId, secret: proof.wireSecret, expiresAt };
        } });
        const error = new Error('Playback verification required'); error.code = 'VERIFICATION_REQUIRED'; error.verificationId = id; throw error;
    }
    if (!result.ok || !data.refId || !data.wireSecret) {
        const error = new Error('Playback attestation failed');
        error.code = 'ATTEST_HTTP_' + result.status;
        if (['TURNSTILE_REQUIRED', 'TURNSTILE_FAILED', 'FALLBACK_REQUIRED', 'ALTCHA_REQUIRED'].includes(data.code)) error.code = data.code;
        throw error;
    }
    return { ref: data.refId, secret: data.wireSecret };
}
const proxy = createGateway({ resolvePlayback, fetchBytes, rewritePlaylist, signUrl });
const playbackCache = new Map();
const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
const origin = `http://127.0.0.1:${port}`;
let client;
async function api(route, fingerprint = randomUUID()) {
    const url = 'https://api.anime.nexus' + route;
    client ||= httpClient();
    const init = { headers: { Origin: 'https://anime.nexus', Referer: 'https://anime.nexus/', Accept: 'application/json', 'X-Fingerprint': fingerprint, 'X-Client-Fingerprint': fingerprint } };
    let response = await fetchBytes(client, url, init);
    if (response.body.includes('__CF$cv$params')) {
        // The site may only send challenge parameters on the first response.
        // Let the solver consume that response instead of fetching it again.
        let first = true;
        await solveCloudflare(url, {
            get: (target, options) => { if (first && target === url) { first = false; return Promise.resolve(response.res); } return client.get(target, options); },
            post: (target, options) => client.post(target, options),
            exportCookies: () => client.exportCookies(),
        });
        response = await fetchBytes(client, url, init);
    }
    if (!response.res.ok) throw new Error(`Catalogue HTTP ${response.res.status}`);
    try { return JSON.parse(response.body.toString('utf8')); }
    catch { throw new Error('Catalogue response was not JSON'); }
}
const server = http.createServer(async (req, res) => {
    const json = (status, data) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); };
    try {
        const url = new URL(req.url, origin);
        if (await verification.handle(req, res, url, origin)) return;
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
            const cached = playbackCache.get(watch);
            const session = cached && proxy.isActive(cached.playId) ? cached : await proxy.openSession(watch);
            playbackCache.set(watch, session);
            for (const [key, value] of playbackCache) if (!proxy.isActive(value.playId)) playbackCache.delete(key);
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
        console.error('Nexus helper failure:', error.stage || 'request', error.code || error.name || 'Error');
        if (res.headersSent) return res.destroy();
        if (error.code === 'VERIFICATION_REQUIRED') return json(428, { error: `Complete Anime Nexus playback verification at ${origin}/verification/${error.verificationId}, then retry the episode.`, verificationUrl: `${origin}/verification/${error.verificationId}` });
        if (['TURNSTILE_REQUIRED', 'TURNSTILE_FAILED', 'FALLBACK_REQUIRED', 'ALTCHA_REQUIRED'].includes(error.code)) return json(502, { error: 'Anime Nexus requires interactive playback verification. Search works, but this helper cannot yet complete that verification.', code: error.code });
        return json(502, { error: 'Resolver verification failed. Check certificate trust, resolver dependencies and JSDCTL_PATH.' });
    }
});
server.listen(port, '127.0.0.1', () => console.log(`Anime Nexus helper listening at ${origin}`));
server.on('close', () => { proxy.closeAll(); closeTransport(); });
