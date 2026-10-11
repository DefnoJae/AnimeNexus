import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tokenRequest, signedResource } from '../helper/signing.mjs';
import { createGateway } from '../helper/gateway.mjs';
test('segment signing uses episode identity and observed segment path fields', () => {
    const request=tokenRequest('episode-id','https://us1.cdn.nexus/anime/streams/test.mkv_5300_0000-2.m4s');
    assert.deepEqual(request,{requestType:'segment',variant:'5300',segIdx:0,track:2,videoId:'episode-id',segmentUrl:'/anime/streams/test.mkv_5300_0000-2.m4s'});
});
test('initialization files use manifest authorization',()=>{
    assert.equal(tokenRequest('episode','https://us1.cdn.nexus/test.mkv_5300_init-2.mp4').requestType,'manifest');
});
test('fresh tokens are obtained for each segment request',async()=>{
    let calls=0;
    const socket={sessionId:'synthetic',getToken:async r=>{assert.equal(r.videoId,'episode');return String(++calls)}};
    const url='https://us1.cdn.nexus/test.mkv_5300_0001-2.m4s';
    const sign=(u,t,s,type,p)=>({u,t,s,type,p});
    const first=await signedResource(socket,'episode',url,sign);
    const second=await signedResource(socket,'episode',url,sign);
    assert.notEqual(first.t,second.t);assert.equal(first.p,'/test.mkv_5300_0001-2.m4s');
});
test('failed master validation closes the socket',async()=>{
    let closed=false;
    const gateway=createGateway({resolvePlayback:async()=>({episodeId:'episode',masterUrl:'https://api.anime.nexus/master.m3u8',socket:{manifestToken:async()=>'',cdnHeaders:()=>({}),close:()=>{closed=true}}}),fetchBytes:async()=>({res:{ok:true},body:Buffer.from('<html>blocked</html>')}),signUrl:u=>u});
    try{await assert.rejects(gateway.openSession('watch'),/Invalid upstream/);assert.equal(closed,true);}finally{gateway.closeAll();}
});
test('only connected playback sessions are reusable', async () => {
    const socket = { connected: true, manifestToken: async () => '', cdnHeaders: () => ({}), close() { this.connected = false; } };
    const gateway = createGateway({ resolvePlayback: async () => ({ episodeId: 'episode', masterUrl: 'https://api.anime.nexus/master.m3u8', socket }), fetchBytes: async () => ({ res: { ok: true }, body: Buffer.from('#EXTM3U\n') }), signUrl: url => url });
    try {
        const { playId } = await gateway.openSession('watch');
        assert.equal(gateway.isActive(playId), true);
        socket.connected = false;
        assert.equal(gateway.isActive(playId), false);
        assert.equal(gateway.isActive('missing'), false);
    } finally { gateway.closeAll(); }
});
