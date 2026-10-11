import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { createRequire } from 'node:module';
import { EventEmitter } from 'node:events';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

export function installTransport(root) {
    const require = createRequire(path.join(root, 'package.json'));
    const entry = require.resolve('curl-cffi-node');
    const { Response } = require(path.join(path.dirname(entry), 'response.js'));
    const worker = spawn(process.env.NEXUS_PYTHON || 'python', ['-u', fileURLToPath(new URL('./transport.py', import.meta.url))], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    const pending = new Map(), sockets = new Map();
    const send = message => worker.stdin.write(JSON.stringify(message) + '\n');
    const fail = () => {
        for (const task of pending.values()) { clearTimeout(task.timer); task.reject(new Error('Verified transport stopped; check Python and curl_cffi installation.')); }
        pending.clear();
    };
    worker.on('error', fail);
    worker.on('exit', fail);
    worker.stdin.on('error', fail);
    const cleanup = () => worker.kill();
    process.once('exit', cleanup);
    // Avoid exposing upstream response bodies or credentials in diagnostics.
    worker.stderr.on('data', () => console.error('Verified transport diagnostic: Python worker reported an error.'));
    createInterface({ input: worker.stdout }).on('line', line => {
        let data; try { data = JSON.parse(line); } catch { return fail(); }
        if (data.socket) {
            const socket = sockets.get(data.socket);
            if (!socket) return;
            if (data.event === 'message') socket.emit('message', Buffer.from(data.data, 'base64'));
            else if (data.event === 'error') socket.emit('error', Object.assign(new Error(`Verified socket ${data.error}`), { code: data.code }));
            else { socket.connected = data.event === 'open'; socket.emit(data.event); if (data.event === 'close') sockets.delete(data.socket); }
            return;
        }
        const task = pending.get(data.id);
        if (!task) return;
        pending.delete(data.id); clearTimeout(task.timer);
        if (data.error) task.reject(Object.assign(new Error(`Verified transport ${data.error}`), { code: data.code }));
        else task.resolve(data);
    });
    class Session {
        constructor(options = {}) { this.options = options; this.id = randomUUID(); this.cookies = []; }
        exportCookies() { return [...this.cookies]; }
        get(url, options) { return this.request('GET', url, options); }
        post(url, options) { return this.request('POST', url, options); }
        async request(method, url, options = {}) {
            const id = randomUUID();
            const result = await new Promise((resolve, reject) => {
                const timer = setTimeout(() => { pending.delete(id); reject(new Error('Verified transport timed out')); }, 45000);
                pending.set(id, { resolve, reject, timer });
                send({ op: 'request', id, session: this.id, options: this.options, method, url, headers: options.headers, data: options.data });
            });
            this.cookies = result.cookies;
            return new Response({ statusCode: result.status, headers: result.headers, effectiveUrl: result.url, body: Buffer.from(result.body, 'base64'), totalTimeMs: 0 });
        }
    }
    class CurlWebSocket extends EventEmitter {
        constructor(url, options = {}) { super(); this.id = randomUUID(); this.url = url; this.options = options; this.connected = false; }
        connect() { sockets.set(this.id, this); send({ op: 'connect', socket: this.id, url: this.url, options: this.options }); }
        send(data) { send({ op: 'send', socket: this.id, data: String(data) }); }
        close() { send({ op: 'close', socket: this.id }); }
    }
    // Install before the upstream ESM wrapper captures these CJS exports.
    require(path.join(path.dirname(entry), 'session.js')).Session = Session;
    require(path.join(path.dirname(entry), 'websocket.js')).CurlWebSocket = CurlWebSocket;
    return () => { process.removeListener('exit', cleanup); worker.stdin.end(); fail(); };
}
