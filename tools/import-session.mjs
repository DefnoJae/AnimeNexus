import { readFileSync, writeFileSync } from 'node:fs';

const [input, output = 'playback-session.json'] = process.argv.slice(2);
if (!input) throw new Error('Usage: node tools/import-session.mjs capture.har [playback-session.json]');
const entries = JSON.parse(readFileSync(input, 'utf8').replace(/^\uFEFF/, '')).log.entries;
const decode = entry => entry.response.content.encoding === 'base64' ? Buffer.from(entry.response.content.text || '', 'base64').toString() : entry.response.content.text || '';
const master = entries.filter(entry => /^https:\/\/api\.anime\.nexus\/api\/anime\/video\/[^/]+\/stream\/video\.m3u8(?:\?|$)/.test(entry.request.url) && entry.response.status === 200 && decode(entry).trimStart().startsWith('#EXTM3U')).at(-1);
if (!master) throw new Error('No successful Anime Nexus HLS master request found. Record the start of playback.');
const videoId = master.request.url.split('/')[6];
const masterHeaders = Object.fromEntries(master.request.headers.map(h => [h.name.toLowerCase(), h.value]));
const cdn = entries.find(entry => /^https:\/\/[^/]+\.cdn\.nexus\//.test(entry.request.url) && entry.request.headers.some(h => h.name.toLowerCase() === 'x-video-uuid') && entry.request.headers.some(h => h.name.toLowerCase() === 'x-session-id' && h.value === masterHeaders['x-session-id']));
if (!cdn) throw new Error('Matching CDN playback requests missing from HAR.');
const cdnHeaders = Object.fromEntries(cdn.request.headers.map(h => [h.name.toLowerCase(), h.value]));
const headers = {};
for (const key of ['X-Challenge', 'X-Encrypted-Secret', 'X-Fingerprint', 'X-Session-ID', 'User-Agent']) {
    if (!masterHeaders[key.toLowerCase()]) throw new Error('Master request is missing ' + key);
    headers[key] = masterHeaders[key.toLowerCase()];
}
headers['X-Client-Fingerprint'] = cdnHeaders['x-client-fingerprint'];
if (!headers['X-Client-Fingerprint'] || cdnHeaders['x-fingerprint'] !== headers['X-Fingerprint']) throw new Error('Browser fingerprint mismatch.');
writeFileSync(output, JSON.stringify({ videoId, episodeId: cdnHeaders['x-video-uuid'], masterUrl: master.request.url, headers }, null, 2), { mode: 0o600 });
console.log('Saved private playback session. It is episode-specific and may already have expired. Do not share or commit it.');
