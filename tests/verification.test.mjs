import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createVerificationBroker } from '../helper/verification.mjs';

const fallback = { provider: 'private-captcha', sitekey: 'testkey', ticket: 'private-ticket', scriptUrl: 'https://anime.nexus/widget.js', puzzleUrl: 'https://anime.nexus/puzzle?ticket=private-ticket' };
function response() {
    return { headers: {}, setHeader(key, value) { this.headers[key] = value; }, writeHead(status, headers) { this.status = status; Object.assign(this.headers, headers); }, end(body) { this.body = body; } };
}
test('verification stores credentials only after an accepted same-origin solution', async () => {
    const broker = createVerificationBroker();
    let submitted = 0;
    const id = broker.create({ episodeId: 'episode', fingerprint: 'fingerprint', fallback, client: {}, submit: async solution => { assert.equal(solution, 'proof'); submitted++; return { ref: 'private-ref', secret: 'private-secret' }; } });
    const origin = 'http://127.0.0.1:3000';
    const url = new URL(origin + '/verification/' + id + '/solution');
    const foreign = Readable.from([Buffer.from(JSON.stringify({ solution: 'proof' }))]); foreign.method = 'POST'; foreign.headers = { origin: 'https://foreign.example' };
    const rejected = response(); await broker.handle(foreign, rejected, url, origin);
    assert.equal(rejected.status, 403); assert.equal(submitted, 0); assert.equal(broker.get('episode'), undefined);
    const local = Readable.from([Buffer.from(JSON.stringify({ solution: 'proof' }))]); local.method = 'POST'; local.headers = { origin };
    const accepted = response(); await broker.handle(local, accepted, url, origin);
    assert.equal(accepted.status, 200); assert.equal(submitted, 1);
    assert.equal(broker.get('episode').fingerprint, 'fingerprint');
    assert.equal(broker.get('episode').attestation.secret, 'private-secret');
    assert.equal(accepted.body.includes('private-secret'), false);
    const page = response(); await broker.handle({ method: 'GET' }, page, new URL(origin + '/verification/' + id), origin);
    assert.equal(page.body.includes('private-ticket'), false);
    assert.equal(page.body.includes('private-secret'), false);
    assert.match(page.body, /button.onclick=/);
});
test('verification rejects foreign asset hosts and script injection', () => {
    const broker = createVerificationBroker();
    assert.throws(() => broker.create({ fallback: { ...fallback, scriptUrl: 'https://foreign.example/widget.js' } }));
    assert.throws(() => broker.create({ fallback: { ...fallback, sitekey: '</script>' } }));
});
test('expired authorization is discarded and a fresh verification can be created', async () => {
    const broker = createVerificationBroker();
    const id = broker.create({ episodeId: 'expired', fingerprint: 'fingerprint', fallback, client: {}, submit: async () => ({ ref: 'ref', secret: 'secret', expiresAt: Date.now() - 1 }) });
    const origin = 'http://127.0.0.1:3000';
    const request = Readable.from([Buffer.from(JSON.stringify({ solution: 'proof' }))]);
    request.method = 'POST'; request.headers = { origin };
    await broker.handle(request, response(), new URL(origin + '/verification/' + id + '/solution'), origin);
    assert.equal(broker.get('expired'), undefined);
    assert.notEqual(broker.create({ episodeId: 'expired', fingerprint: 'fresh', fallback, client: {}, submit: async () => ({}) }), id);
});
