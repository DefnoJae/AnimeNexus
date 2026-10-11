// Field values and paths verified against the browser's successful socket traffic.
export function tokenRequest(episodeId, absoluteUrl) {
    const { pathname } = new URL(absoluteUrl);
    const segment = pathname.match(/\.mkv_(\d+)_(\d+)-(\d+)\.m4s$/);
    if (!segment) return { requestType: 'manifest', manifestUrl: pathname, videoId: episodeId };
    return { requestType: 'segment', variant: segment[1], segIdx: Number(segment[2]), track: Number(segment[3]), videoId: episodeId, segmentUrl: pathname };
}
export async function signedResource(socket, episodeId, url, signUrl) {
    const request = tokenRequest(episodeId, url);
    const token = request.requestType === 'manifest'
        ? await socket.manifestToken(request.manifestUrl)
        : await socket.getToken(request);
    return signUrl(url, token, socket.sessionId, request.requestType, request.segmentUrl);
}
