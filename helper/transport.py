"""Private stdio transport. Credentials stay in memory, never in diagnostic output."""
import base64
import json
import os
import queue
import ssl
import sys
import threading
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / 'python-deps'))
from curl_cffi import Curl, CurlError, CurlOpt, CurlWsFlag, requests
from curl_cffi.requests import WebSocket

# Use the same existing Windows trust store as the browser. No trust is installed.
ca = os.environ.get('NEXUS_CA_FILE')
if not ca:
    import tempfile
    pem = ''.join(ssl.DER_cert_to_PEM_cert(cert) for cert, encoding, trust in ssl.enum_certificates('ROOT')
                  if encoding == 'x509_asn' and (trust is True or '1.3.6.1.5.5.7.3.1' in trust)) if sys.platform == 'win32' else ''
    if pem:
        bundle = tempfile.NamedTemporaryFile(mode='w', suffix='.pem', delete=False)
        bundle.write(pem)
        bundle.close()
        ca = bundle.name

output_lock = threading.Lock()
sessions = {}
sockets = {}

def emit(data):
    with output_lock:
        print(json.dumps(data), flush=True)

def cookies(session):
    return ['\t'.join([c.domain, 'TRUE' if c.domain_initial_dot else 'FALSE', c.path,
                      'TRUE' if c.secure else 'FALSE', str(c.expires or 0), c.name, c.value])
            for c in session.cookies.jar]

def request(msg):
    try:
        sid = msg['session']
        if sid not in sessions:
            sessions[sid] = (requests.Session(impersonate=msg['options'].get('impersonate', 'chrome131'),
                                              verify=ca or True), threading.Lock())
        session, lock = sessions[sid]
        with lock:
            options = msg['options']
            headers = {**options.get('headers', {}), **msg.get('headers', {})}
            response = session.request(msg['method'], msg['url'], headers=headers,
                                       data=msg.get('data'), timeout=options.get('timeout', 30),
                                       allow_redirects=options.get('followRedirects', True))
            emit({'id': msg['id'], 'status': response.status_code, 'url': response.url,
                  'headers': '\r\n'.join(k + ': ' + v for k, v in response.headers.multi_items()),
                  'body': base64.b64encode(response.content).decode(), 'cookies': cookies(session)})
    except Exception as error:
        emit({'id': msg['id'], 'error': type(error).__name__, 'code': getattr(error, 'code', None)})

def socket_loop(msg, commands):
    sid = msg['socket']
    ws = WebSocket(curl=Curl(cacert=ca or ''))
    try:
        options = msg['options']
        ws.connect(msg['url'], impersonate=options.get('impersonate', 'chrome131'),
                   headers=options.get('headers', {}), verify=True, timeout=30,
                   curl_options={CurlOpt.CAINFO: ca} if ca else {})
        emit({'socket': sid, 'event': 'open'})
        fragments = bytearray()
        while True:
            while not commands.empty():
                command = commands.get_nowait()
                if command['op'] == 'close':
                    return
                ws.send_str(command['data'])
            try:
                data, frame = ws.curl.ws_recv()
                if frame.flags & CurlWsFlag.CLOSE:
                    return
                fragments.extend(data)
                if not frame.bytesleft and not frame.flags & CurlWsFlag.CONT:
                    emit({'socket': sid, 'event': 'message', 'data': base64.b64encode(fragments).decode()})
                    fragments.clear()
            except CurlError as error:
                if error.code != 81:
                    raise
                time.sleep(0.01)
    except Exception as error:
        emit({'socket': sid, 'event': 'error', 'error': type(error).__name__, 'code': getattr(error, 'code', None)})
    finally:
        ws.curl.close()
        emit({'socket': sid, 'event': 'close'})
        sockets.pop(sid, None)

try:
    for line in sys.stdin:
        msg = json.loads(line)
        if msg['op'] == 'request':
            threading.Thread(target=request, args=(msg,), daemon=True).start()
        elif msg['op'] == 'connect':
            commands = queue.Queue()
            sockets[msg['socket']] = commands
            threading.Thread(target=socket_loop, args=(msg, commands), daemon=True).start()
        elif msg['op'] in ('send', 'close') and msg['socket'] in sockets:
            sockets[msg['socket']].put(msg)
finally:
    if ca and not os.environ.get('NEXUS_CA_FILE'):
        os.unlink(ca)
