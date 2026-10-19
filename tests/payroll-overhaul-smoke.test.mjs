import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const file=name=>readFileSync(new URL("../"+name,import.meta.url),"utf8");
const html=file("index.html"),script=file("src/app.js"),workflow=file("phase3-payroll.html");
test("all daily workflows and creation controls are present",()=>{
 for(const key of ["dashboard","employees","time","payroll","commissions","service","access"]){
  assert.match(html,new RegExp('data-page="'+key+'"'));
 }
 for(const id of ["employeeForm","timeForm","runForm","lineSearch","lineSort","runSort","empSort","runDetails","phase3Payroll"]){
  assert.ok(html.includes('id="'+id+'"'),"Missing form or filter "+id);
 }
});
test("payroll import, policy and correction elements remain addressable",()=>{
 for(const id of ["p3Inspect","p3Export","p3Original","p3CorrectionRunReason","p3NewCorrection",
  "p3CompareTarget","p3Compare","p3Comparison","p3PolicyForm","p3PolicyStatus","p3RunReview"]){
  assert.ok(workflow.includes('id="'+id+'"'),"Missing payroll action "+id);
 }
});
test("no inline money editors remain and draft edits use a transaction",()=>{
 assert.ok(script.includes("mountPaylineEditor()"));
 assert.ok(script.includes("runTransaction(db,async transaction=>"));
 assert.ok(script.includes('status!=="draft"'));
 assert.ok(!script.includes('mk("input","adjust-input")'));
});
test("required styling and modules are published through Pages",()=>{
 assert.match(html,/payroll-refresh\.css\?v=sterling-payroll-overhaul/);
 assert.match(html,/app\.js\?v=sterling-payroll-overhaul/);
 const pages=file(".github/workflows/pages.yml");
 assert.match(pages,/\*\.css/);
 assert.match(pages,/cp src\/\*\.js _site\/src\//);
});
test("navigation uses ordered daily operations and advanced review stays collapsed",()=>{
 const indexes=["data-page=\"employees\"","data-page=\"time\"","data-page=\"payroll\"","data-page=\"commissions\""].map(key=>html.indexOf(key));
 assert.ok(indexes.every(x=>x>=0));
 assert.deepEqual([...indexes].sort((a,b)=>a-b),indexes);
 assert.match(workflow,/<details class="payroll-advanced-details">/);
 assert.match(workflow,/<details class="panel payroll-settings-panel">/);
});
