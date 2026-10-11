import { randomUUID } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { signedResource } from './signing.mjs';

export function createGateway({ resolvePlayback, fetchBytes, rewritePlaylist, signUrl }) {
    const sessions = new Map();
    const ttl = 30 * 60 * 1000;
    const close = id => { const session = sessions.get(id); session?.socket.close(); sessions.delete(id); };
    const timer = setInterval(() => { for (const [id,s] of sessions) if (Date.now() - s.created >= ttl) close(id); }, 60000);
    timer.unref();
    function get(id) { const s = sessions.get(id); if (!s || Date.now()-s.created>=ttl) { close(id); throw new Error('Playback session expired'); } return s; }
    const headers = s => ({ ...s.socket.cdnHeaders(), Origin: 'https://anime.nexus', Referer: s.watchUrl });
    async function playlist(s, url) {
        const signed = await signedResource(s.socket, s.episodeId, url, signUrl);
        const { res, body } = await fetchBytes(s.http, signed, { headers: headers(s) });
        if (!res.ok || !body.toString('utf8').trimStart().startsWith('#EXTM3U')) throw new Error('Invalid upstream HLS playlist');
        return body.toString('utf8');
    }
    return {
        async openSession(watchUrl) {
            const s = await resolvePlayback(watchUrl);
            try {
                const masterBody = await playlist(s, s.masterUrl);
                const playId = randomUUID();
                sessions.set(playId, { ...s, masterBody, created: Date.now() });
                return { playId };
            } catch (error) { s.socket.close(); throw error; }
        },
        async serveMaster(id, origin) { const s=get(id); return rewritePlaylist(s.masterBody,s.masterUrl,id,origin); },
        async servePlaylist(id, origin, url) { const s=get(id); return { contentType:'application/vnd.apple.mpegurl', buffer:Buffer.from(rewritePlaylist(await playlist(s,url),url,id,origin)) }; },
        async pipeCdn(id, url, response) {
            const s=get(id);
            const signed=await signedResource(s.socket,s.episodeId,url,signUrl);
            const upstream=await s.http.get(signed,{headers:headers(s)});
            if (!upstream.ok) throw new Error('Upstream media request failed');
            response.writeHead(200,{'Content-Type':upstream.headers.get('content-type')||'application/octet-stream'});
            await pipeline(upstream.stream(),response);
        },
        closeAll() { clearInterval(timer); for(const id of sessions.keys())close(id); },
    };
}
