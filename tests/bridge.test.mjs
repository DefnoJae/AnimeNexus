import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const code = ts.transpileModule(readFileSync(new URL('../payload.ts',import.meta.url),'utf8'), { compilerOptions:{target:ts.ScriptTarget.ES2020} }).outputText;
const id='01a0e350-30b2-71b4-9c02-f02aad74f12e';
function provider(handler, preference='http://127.0.0.1:3000') {
 const ctx=vm.createContext({$getUserPreference:()=>preference,fetch:async(url)=>{const data=await handler(url);return {ok:!data.error,json:()=>data,status:data.error?502:200};}});
 vm.runInContext(code+'\nglobalThis.p=new Provider()',ctx);return ctx.p;
}
test('search goes through helper and preserves source titles',async()=>{
 const p=provider(url=>{assert.ok(url.startsWith('http://127.0.0.1:3000/api/catalogue?path='));assert.ok(decodeURIComponent(url).includes('search=Overgeared'));return {data:[{id,name:'Overgeared',slug:'overgeared'}]};});
 assert.equal((await p.search({query:'Overgeared'}))[0].title,'Overgeared');
});
test('episodes paginate, deduplicate, sort and exclude fractional entries',async()=>{
 const p=provider(url=>{const page=decodeURIComponent(url).includes('page=2&')?2:1;return {data:[{id,number:1,slug:'one'},{id:'019e8f11-1fc0-7197-ba88-764e6beaa8b0',number:2,slug:'two'},{number:1.5,slug:'special'}],meta:{current_page:page,last_page:2}};});
 const entries=await p.findEpisodes(id);assert.equal(entries.length,2);assert.equal(entries[0].number,1);
});
test('playback returns local live gateway without captured credentials',async()=>{
 const p=provider(url=>{assert.ok(url.includes('/api/resolve?url='));return {playUrl:'http://127.0.0.1:3000/play/example/master.m3u8'};});
 const result=await p.findEpisodeServer({id,url:`https://anime.nexus/watch/${id}/episode-1`},'default');assert.equal(result.videoSources[0].type,'m3u8');assert.equal(Object.keys(result.headers).length,0);
});
test('helper errors remain strings and transport errors do not leak secrets',async()=>{
 await assert.rejects(provider(()=>({error:'Resolver verification failed'})).search({query:'test'}),e=>typeof e==='string'&&e.includes('verification failed'));
 await assert.rejects(provider(()=>{throw new Error('private token');}).search({query:'test'}),e=>typeof e==='string'&&!e.includes('private token'));
});
test('rejects remote helper addresses and foreign playback URLs',async()=>{
 await assert.rejects(provider(()=>({}),'http://remote.example:3000').search({query:'test'}),e=>typeof e==='string');
 await assert.rejects(provider(()=>({playUrl:'https://foreign.example/master.m3u8'})).findEpisodeServer({id,url:`https://anime.nexus/watch/${id}/one`},'default'),e=>typeof e==='string'&&e.includes('playback URL'));
});
