import { randomUUID } from 'node:crypto';

const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const allowed = value => {
    const url = new URL(value, 'https://anime.nexus');
    if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') || !(/(^|\.)anime\.nexus$/.test(url.hostname) || /(^|\.)privatecaptcha\.com$/.test(url.hostname))) throw new Error('Unsupported verification host');
    return url.href;
};

export function createVerificationBroker() {
    const jobs = new Map();
    function prune() { for (const [id, job] of jobs) if (job.expires <= Date.now()) jobs.delete(id); }
    const html = body => '<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Anime Nexus verification</title><style>body{font:18px system-ui;max-width:640px;margin:60px auto;padding:24px;background:#111827;color:#e5e7eb}button,a{font:inherit;color:#93c5fd}button{background:#1f2937;padding:12px;border:1px solid #64748b;border-radius:8px}</style>' + body + '</html>';
    return {
        get(episodeId) { prune(); return [...jobs.values()].find(job => job.episodeId === episodeId && job.attestation && (!job.attestation.expiresAt || job.attestation.expiresAt > Date.now())); },
        create({ episodeId, fingerprint, fallback, client, submit }) {
            prune();
            const existing = [...jobs.values()].find(job => job.episodeId === episodeId && !job.attestation);
            if (existing) return existing.id;
            if (fallback?.provider !== 'private-captcha' || !/^[A-Za-z0-9_-]{1,128}$/.test(fallback.sitekey || '') || typeof fallback.ticket !== 'string') throw new Error('Unsupported playback verification');
            const id = randomUUID();
            const deadline = Number.isFinite(fallback.expiresAt) ? (fallback.expiresAt < 1e12 ? fallback.expiresAt * 1000 : fallback.expiresAt) : Date.now() + 5 * 60 * 1000;
            jobs.set(id, { id, episodeId, fingerprint, sitekey: fallback.sitekey, script: allowed(fallback.scriptUrl), puzzle: allowed(fallback.puzzleUrl), client, submit, expires: Math.min(deadline, Date.now() + 5 * 60 * 1000) });
            return id;
        },
        async handle(req, res, url, origin) {
            if (!url.pathname.startsWith('/verification')) return false;
            prune();
            res.setHeader('Cache-Control', 'no-store');
            res.setHeader('Referrer-Policy', 'no-referrer');
            res.setHeader('X-Content-Type-Options', 'nosniff');
            const respond = (status, mime, body) => { res.writeHead(status, { 'Content-Type': mime }); res.end(body); return true; };
            if (url.pathname === '/verification' && req.method === 'GET') return respond(200, 'text/html; charset=utf-8', html('<h1>Anime Nexus playback</h1><p>Complete verification, then retry the episode in Seanime.</p>' + [...jobs.values()].map(job => `<p><a href="/verification/${job.id}">${job.attestation ? 'Verified' : 'Verify playback'} (${escape(job.episodeId)})</a></p>`).join('')));
            const match = url.pathname.match(/^\/verification\/([a-f0-9-]{36})(?:\/(script|puzzle|solution))?$/);
            const job = match && jobs.get(match[1]);
            if (!job) return respond(404, 'text/plain', 'Verification expired. Retry the episode in Seanime.');
            const resource = match[2];
            if (!resource && req.method === 'GET') {
                const page = `<h1>Verify Anime Nexus playback</h1><p>This runs Anime Nexus's supported Private Captcha verification. After completion, retry the episode in Seanime.</p><form><div id="widget"></div><button id="verify" type="button">Verify playback</button></form><p id="status">Ready.</p><script src="/verification/${job.id}/script"></script><script>
const status=document.getElementById('status'),button=document.getElementById('verify'),host=document.getElementById('widget');let widget;
host.addEventListener('privatecaptcha:finish',async()=>{try{const nav=performance.getEntriesByType('navigation')[0];const audio=new AudioContext();const metadata={navigation:{startTime:nav.startTime,domContentLoaded:nav.domContentLoadedEventEnd,loadEventEnd:nav.loadEventEnd},audio:{sampleRate:audio.sampleRate,baseLatency:audio.baseLatency,outputLatency:audio.outputLatency||0},screen:{width:innerWidth,height:innerHeight,colorDepth:screen.colorDepth,pixelRatio:devicePixelRatio},collectedAt:Date.now()};audio.close();const response=await fetch('/verification/${job.id}/solution',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({solution:widget.solution(),metadata})});if(!response.ok)throw Error();status.textContent='Verified. Retry the episode in Seanime.';}catch{status.textContent='Verification was rejected. Retry the episode to start again.';button.disabled=false;}});
host.addEventListener('privatecaptcha:error',()=>{status.textContent='Verification could not complete. Retry the episode.';button.disabled=false;});
button.onclick=()=>{button.disabled=true;status.textContent='Verifying…';try{widget=window.privateCaptcha.render(host,{sitekey:${JSON.stringify(job.sitekey)},puzzleEndpoint:location.origin+'/verification/${job.id}/puzzle',startMode:'click',displayMode:'hidden'});Promise.resolve(widget.execute()).catch(()=>{status.textContent='Verification could not start.';button.disabled=false;});}catch{status.textContent='Verification could not start.';button.disabled=false;}};</script>`;
                return respond(200, 'text/html; charset=utf-8', html(page));
            }
            if (resource === 'script' && req.method === 'GET') {
                const result = await job.client.get(job.script);
                return respond(result.status, 'application/javascript', result.buffer());
            }
            if (resource === 'puzzle' && ['GET', 'POST'].includes(req.method)) {
                if (req.headers.origin && req.headers.origin !== origin) return respond(403, 'text/plain', 'Invalid origin');
                const upstream = new URL(job.puzzle);
                for (const [key, value] of url.searchParams) upstream.searchParams.set(key, value);
                const headers = { Origin: 'https://anime.nexus', Referer: 'https://anime.nexus/', Accept: '*/*' };
                if (req.headers['content-type']) headers['Content-Type'] = req.headers['content-type'];
                const chunks = []; let size = 0;
                for await (const chunk of req) { size += chunk.length; if (size > 65536) return respond(413, 'text/plain', 'Request too large'); chunks.push(chunk); }
                const result = req.method === 'POST' ? await job.client.post(upstream.href, { headers, data: Buffer.concat(chunks).toString() }) : await job.client.get(upstream.href, { headers });
                return respond(result.status, result.headers.get('content-type') || 'application/octet-stream', result.buffer());
            }
            if (resource === 'solution' && req.method === 'POST') {
                if (req.headers.origin !== origin || job.attestation) return respond(403, 'text/plain', 'Invalid submission');
                const chunks = []; let size = 0;
                for await (const chunk of req) { size += chunk.length; if (size > 65536) return respond(413, 'text/plain', 'Request too large'); chunks.push(chunk); }
                let body; try { body = JSON.parse(Buffer.concat(chunks).toString()); } catch { return respond(400, 'text/plain', 'Invalid solution'); }
                if (typeof body.solution !== 'string' || !body.solution || body.solution.length > 32768) return respond(400, 'text/plain', 'Invalid solution');
                let metadata;
                if (body.metadata) {
                    const source = body.metadata;
                    if (!['navigation', 'audio', 'screen'].every(key => source[key] && Object.values(source[key]).every(value => typeof value === 'number' && Number.isFinite(value) && value >= 0)) || !Number.isFinite(source.collectedAt)) return respond(400, 'text/plain', 'Invalid browser metadata');
                    metadata = { navigation: source.navigation, audio: source.audio, screen: source.screen, collectedAt: source.collectedAt };
                }
                job.attestation = await job.submit(body.solution, metadata);
                if (job.attestation.expiresAt) job.expires = job.attestation.expiresAt;
                return respond(200, 'application/json', '{"verified":true}');
            }
            return respond(405, 'text/plain', 'Unsupported verification request');
        },
    };
}
