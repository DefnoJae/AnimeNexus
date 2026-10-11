import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createRequire } from 'node:module';
import { installTransport } from '../helper/transport.mjs';

test('verified transport preserves session cookies and binary response API', { skip: !process.env.NEXUS_RESOLVER_PATH || !process.env.NEXUS_PYTHON }, async () => {
    const server = http.createServer((req, res) => {
        if (req.url === '/cookie') { res.setHeader('Set-Cookie', 'fixture=present; Path=/'); res.end('ready'); }
        else { assert.match(req.headers.cookie || '', /fixture=present/); res.setHeader('Content-Type', 'application/octet-stream'); res.end(Buffer.from([0, 128, 255])); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const close = installTransport(process.env.NEXUS_RESOLVER_PATH);
    try {
        const require = createRequire(process.env.NEXUS_RESOLVER_PATH + '/package.json');
        const { Session } = require('curl-cffi-node');
        const session = new Session({ timeout: 10 });
        const origin = `http://127.0.0.1:${server.address().port}`;
        assert.equal((await session.get(origin + '/cookie')).status, 200);
        assert.ok(session.exportCookies().some(c => c.split('\t')[5] === 'fixture'));
        const response = await session.get(origin + '/binary');
        assert.equal(response.headers.get('content-type'), 'application/octet-stream');
        assert.deepEqual(response.buffer(), Buffer.from([0, 128, 255]));
        const chunks = []; for await (const chunk of response.stream()) chunks.push(chunk);
        assert.deepEqual(Buffer.concat(chunks), response.buffer());
    } finally { close(); await new Promise(resolve => server.close(resolve)); }
});
