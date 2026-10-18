import test from "node:test";
import assert from "node:assert/strict";
import {PAYROLL_SAFE_WRITE_SIZE,chunkPayrollWrites,planPayrollDraftWrites} from "../src/payroll-write-plan.js";

const lines=count=>Array.from({length:count},(_,i)=>({employeeId:"worker-"+(i+1),regularCents:1000}));
test("22 employees split into safe groups rather than one rejected Firestore batch",()=>{
 const chunks=planPayrollDraftWrites({lines:lines(22)});
 assert.deepEqual(chunks.map(x=>x.length),[6,6,6,4]);
 assert.deepEqual(chunks.flat().map(x=>x.type),Array(22).fill("line"));
 assert.ok(chunks.every(x=>x.length<=PAYROLL_SAFE_WRITE_SIZE));
});
test("handles 250 employees without crossing rules budget",()=>{
 const chunks=planPayrollDraftWrites({lines:lines(250)});
 assert.equal(chunks.flat().length,250);
 assert.ok(chunks.every(x=>x.length<=6));
});
test("repeated generation updates matching lines and removes deleted ones",()=>{
 const chunks=planPayrollDraftWrites({lines:lines(1),existingIds:["worker-1","worker-2"]}).flat();
 assert.equal(chunks.filter(x=>x.type==="line").length,1);
 assert.deepEqual(chunks.filter(x=>x.type==="delete").map(x=>x.employeeId),["worker-2"]);
});
test("commission claim and release mutations share the same per-batch budget",()=>{
 const chunks=planPayrollDraftWrites({lines:lines(5),claims:[{id:"a"},{id:"b"}],releases:[{id:"c"}]});
 assert.equal(chunks.flat().length,8);
 assert.ok(chunks.every(x=>x.length<=6));
});
test("malformed and duplicated input is rejected before any writes",()=>{
 assert.throws(()=>planPayrollDraftWrites({lines:[...lines(1),...lines(1)]}),/duplicate/i);
 assert.throws(()=>planPayrollDraftWrites({lines:[],claims:[{id:"a"}],releases:[{id:"a"}]}),/duplicated/i);
 assert.throws(()=>chunkPayrollWrites(lines(22),22),/budget/i);
});
