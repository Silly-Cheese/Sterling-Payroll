import test from "node:test";
import assert from "node:assert/strict";
import {readCompletePages} from "../src/payroll-paging.js";

const list = amount => Array.from({length:amount},(_,i)=>({id:"row"+String(i).padStart(4,"0")}));

async function fakeFetch(all,pageSize) {
 const calls = [];
 const records = await readCompletePages(async(cursor,limit)=>{
  const offset = cursor === null ? 0 : cursor;
  const found = all.slice(offset,offset+limit);
  calls.push(offset);
  return {records:found,nextCursor:found.length ? offset+found.length : null};
 },{pageSize});
 return {records,calls};
}

test("payroll paging fetches past the first 100/200 entries",async()=>{
 for(const total of [99,100,101,199,200,201,405]){
  const all = list(total);
  const {records} = await fakeFetch(all,100);
  assert.deepEqual(records,all);
 }
});
test("exact page boundary makes one more read before declaring completion",async()=>{
 const {records,calls} = await fakeFetch(list(200),200);
 assert.equal(records.length,200);
 assert.deepEqual(calls,[0,200]);
});
test("read errors reject rather than generating partial payroll",async()=>{
 await assert.rejects(readCompletePages(async(cursor)=>{
  if(cursor!==null)throw Error("network offline");
  return {records:list(2),nextCursor:2};
 },{pageSize:2}),/network offline/);
});
test("company change aborts processing after network responses",async()=>{
 let ready=true;
 await assert.rejects(readCompletePages(async()=>{
  ready=false;
  return {records:list(1),nextCursor:null};
 },{checkAccess:()=>{if(!ready)throw Error("Company changed");}}),/Company changed/);
});
test("duplicated records or missing page cursors cannot lead to wrong earnings",async()=>{
 let times=0;
 await assert.rejects(readCompletePages(async()=>{
  times++;
  return times===1?{records:[{id:"x"}],nextCursor:"x"}:{records:[{id:"x"}],nextCursor:"x"};
 },{pageSize:1}),/duplicate/i);
 await assert.rejects(readCompletePages(async()=>({records:[{id:"x"}],nextCursor:null}),{pageSize:1}),/cursor/i);
});
test("limits prevent runaway reads without silently accepting partial data",async()=>{
 await assert.rejects(readCompletePages(async()=>({records:[{id:"x"}],nextCursor:"x"}),{pageSize:1,maxPages:1}),/exceeds/);
});
