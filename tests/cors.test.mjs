import test from 'node:test';
import assert from 'node:assert/strict';
import { playbackCors } from '../helper/cors.mjs';
function response() { return { headers: {}, setHeader(key, value) { this.headers[key] = value; }, writeHead(status, headers) { this.status = status; Object.assign(this.headers, headers); }, end() {} }; }
test('local Seanime player can read playlists and preflight Range requests', () => {
    const res = response();
    assert.equal(playbackCors({ method: 'GET', headers: { origin: 'http://localhost:43211' } }, res, '/play/id/master.m3u8'), false);
    assert.equal(res.headers['Access-Control-Allow-Origin'], 'http://localhost:43211');
    const preflight = response();
    assert.equal(playbackCors({ method: 'OPTIONS', headers: { origin: 'http://127.0.0.1:43211' } }, preflight, '/play/id/x/cdn/file'), true);
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers['Access-Control-Allow-Headers'], 'Range');
});
test('foreign sites and verification routes receive no playback CORS permission', () => {
    for (const [origin, path] of [['https://foreign.example', '/play/id/master.m3u8'], ['http://localhost:43211', '/verification/id/solution']]) {
        const res = response();
        playbackCors({ method: 'GET', headers: { origin } }, res, path);
        assert.equal(res.headers['Access-Control-Allow-Origin'], undefined);
    }
});
