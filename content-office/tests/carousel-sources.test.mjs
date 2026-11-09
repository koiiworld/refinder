import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const src=fs.readFileSync(new URL('../src/lib/captured-post-views.ts',import.meta.url),'utf8').replace(/^import .*;$/gm,'');
const code=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const exports={};const ctx=vm.createContext({exports,q:async(_sql,args)=>args[0]==='mine'?[{day:'2026-11-10',items:[{title:'닭한마리 만드는 법',views:30},{title:'다른 글',views:0}]},{day:'2026-11-08',items:[{title:'닭한마리 만드는 법',views:70}]}]:[]});vm.runInContext(code,ctx);
test('진단·캐러셀 공유 조회수: 블로그 분리·일간 합계·기간·없는 값은 null',async()=>{
 const r=await exports.capturedPostViews('mine');assert.equal(r.items[0].views,100);assert.match(r.label,/2026-11-08 ~ 2026-11-10/);assert.match(r.label,/기록 2개/);assert.equal((await exports.capturedPostViews('other')).items.length,0);
 const titles=['닭한마리 만드는 법','다른 글'];assert.equal(exports.matchCapturedViews(titles[0],titles,r.items),100);assert.equal(exports.matchCapturedViews(titles[1],titles,r.items),0);assert.equal(exports.matchCapturedViews('없는 글',['없는 글'],r.items),null);
});
test('잘린 제목은 유일할 때만 매칭, 비슷하거나 중복된 제목에 숫자 배정 금지',()=>{
 const prefix='집에서 만드는 따뜻한 닭한마리 황금레시피';const titles=[prefix+' 기본'];
 assert.equal(exports.matchCapturedViews(titles[0],titles,[{title:prefix+'…',views:55}]),55);
 assert.equal(exports.matchCapturedViews(titles[0],[...titles,prefix+' 응용'],[{title:prefix+'…',views:55}]),null);
 assert.equal(exports.matchCapturedViews('동일 제목',['동일 제목','동일 제목'],[{title:'동일 제목',views:77}]),null);
});
