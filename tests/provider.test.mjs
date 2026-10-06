import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../payload.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
const series = '019e8f11-1fc0-7197-ba88-764e6beaa8b0';
const episodeId = '01a0e350-30b2-71b4-9c02-f02aad74f12e';
const videoId = '01a0e350-527a-72ef-8976-962178947ef4';
const hls = `https://api.anime.nexus/api/anime/video/${videoId}/stream/video.m3u8`;
const session = { videoId, episodeId, masterUrl: hls, headers: Object.fromEntries(['X-Challenge','X-Encrypted-Secret','X-Fingerprint','X-Session-ID','X-Client-Fingerprint','User-Agent'].map(key => [key, 'synthetic-test-value'])) };
function provider(handler, preference = '') {
    const context = vm.createContext({ fetch: async (url, opts) => { const data = await handler(url, opts); return { ok: data.status === undefined || data.status === 200, status: data.status || 200, json: () => data, text: () => data.text || '' }; }, $getUserPreference: () => preference });
    vm.runInContext(code + '\nglobalThis.provider = new Provider();', context);
    return context.provider;
}
test('search preserves query and title and creates website series links', async () => {
    const p = provider(url => {
        assert.ok(url.includes('search=Frieren%20%26%20friends'));
        return { data: [{ id: series, name: 'Frieren & friends', slug: 'frieren' }] };
    });
    const [result] = await p.search({ query: ' Frieren & friends ', dub: false });
    assert.equal(result.title, 'Frieren & friends');
    assert.equal(result.url, `https://anime.nexus/series/${series}/frieren`);
});
test('episodes paginate, deduplicate, sort and omit fractional numbers', async () => {
    const p = provider(url => {
        const second = url.includes('&page=2&');
        return { data: second ? [{ id: episodeId, number: 1, slug: 'one' }] : [{ id: series, number: 2, slug: 'two' }, { id: episodeId, number: 1, slug: 'one' }, { number: 1.5, slug: 'special' }], meta: { current_page: second ? 2 : 1, last_page: 2 } };
    });
    const result = await p.findEpisodes(series);
    assert.equal(result.length, 2);
    assert.equal(result[0].number, 1);
    assert.equal(result[1].number, 2);
});
test('rejects wrong pagination and HTTP verification failures', async () => {
    await assert.rejects(provider(() => ({ data: [], meta: { current_page: 1, last_page: 2 } })).findEpisodes(series), /pagination/);
    await assert.rejects(provider(() => ({ status: 403 })).search({ query: 'Overgeared' }), reason => typeof reason === 'string' && reason.includes('HTTP 403'));
});
test('transport rejection exposes a safe string without leaking request details', async () => {
    await assert.rejects(provider(() => { throw new Error('private credential'); }).search({ query: 'Overgeared' }), reason => typeof reason === 'string' && reason.includes('network request failed') && !reason.includes('private credential'));
});
test('server keeps master audio, forwards both header sets, maps subtitles', async () => {
    const p = provider((url, opts) => {
        if (url === hls) {
            assert.equal(opts.headers['X-Video-UUID'], episodeId);
            assert.equal(opts.headers['X-Challenge'], 'synthetic-test-value');
            return { text: '#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO\n#EXT-X-STREAM-INF:BANDWIDTH=1000\nhttps://us1.cdn.nexus/video.m3u8' };
        }
        return { data: { hls, subtitles: [{ id: 1, src: 'https://assets.anime.nexus/en.ass', srcLang: 'en', label: 'English' }] } };
    }, JSON.stringify(session));
    const result = await p.findEpisodeServer({ id: episodeId }, 'default');
    assert.equal(result.videoSources[0].url, hls);
    assert.equal(result.videoSources[0].subtitles[0].isDefault, true);
    assert.equal(result.headers['X-Client-Fingerprint'], 'synthetic-test-value');
});
test('fails closed for missing session, unrelated session, invalid master and unknown server', async () => {
    const metadata = () => ({ data: { hls } });
    await assert.rejects(provider(metadata).findEpisodeServer({ id: episodeId }, 'default'), /fresh verified/);
    await assert.rejects(provider(metadata, JSON.stringify({ ...session, videoId: series })).findEpisodeServer({ id: episodeId }, 'default'), /fresh verified/);
    await assert.rejects(provider(metadata, JSON.stringify(session)).findEpisodeServer({ id: episodeId }, 'default'), /master/);
    await assert.rejects(provider(metadata).findEpisodeServer({ id: episodeId }, 'other'), /Unknown/);
});
