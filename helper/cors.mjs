// Allow Seanime's local browser player to read the playback gateway.
export function playbackCors(req, res, pathname) {
    if (!pathname.startsWith('/play/')) return false;
    const requested = req.headers.origin;
    // Denshi serves its installed interface from this exact Electron origin.
    if (requested !== 'app://-') {
        let origin;
        try { origin = new URL(requested); } catch { return false; }
        if (!['http:', 'https:'].includes(origin.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname) || origin.username || origin.password || origin.origin !== requested) return false;
    }
    res.setHeader('Access-Control-Allow-Origin', requested);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');
    if (req.method !== 'OPTIONS') return false;
    res.writeHead(204, { 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Range', 'Access-Control-Max-Age': '600' });
    res.end();
    return true;
}
