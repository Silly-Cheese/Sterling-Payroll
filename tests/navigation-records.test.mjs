import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const read=path=>fs.readFileSync(new URL("../"+path,import.meta.url),"utf8");
test("Phase 5 asynchronous mounting is awaited before any refresh",()=>{
 const app=read("src/app.js");
 assert.match(app,/phase5\s*=\s*await mountPhase5\(/);
 assert.doesNotMatch(app,/phase5\s*=\s*mountPhase5\(/);
});
test("Every large-directory filter and density control is wired",()=>{
 const html=read("index.html"),app=read("src/app.js");
 for(const id of ["densityToggle","clientSearch","empStatus","timeSearch","timeStatus","runSearch","runStatus","attentionQueue","recentPayroll"]){
  assert.ok(html.includes('id="'+id+'"'),"Missing "+id+" control");
  assert.ok(app.includes('"'+id+'"'),"Missing "+id+" handler");
 }
});
test("Owner inline delete actions appear in the actual records",()=>{
 const app=read("src/app.js"),service=read("src/phase5.js"),manage=read("src/record-actions.js");
 for(const phrase of ['ownerActions.remove("employees"','ownerActions.remove("timeEntries"','ownerActions.remove("payrollRuns"','ownerDelete("billingInvoices"','ownerDelete("supportTickets"']){
  assert.ok(app.includes(phrase)||service.includes(phrase),phrase);
 }
 assert.match(manage,/if\(!S\(\)\.platformOwner/);
 assert.match(manage,/ensureSafe\(kind,latest\)/);
 assert.match(manage,/ownerAudit/);
});
test("Historical payroll, ledger and communication records cannot be orphaned",()=>{
 const module=read("src/record-actions.js");
 assert.match(module,/timeCorrections/);
 assert.match(module,/employeeLinks/);
 assert.match(module,/payrollRuns:\["lines","snapshots","revisions"\]/);
 assert.match(module,/billingInvoices:\["events"\]/);
 assert.match(module,/internalNotes/);
});
test("Deploy bundle contains owner record manager",()=>{
 const deploy=read(".github/workflows/pages.yml"),verify=read(".github/workflows/verify.yml");
 assert.match(deploy,/src\/record-actions\.js/);
 assert.match(verify,/node --check src\/record-actions\.js/);
});

test("Direct record deletion requires a typed phrase and explicit reason",()=>{
 const modal=read("src/record-actions.js");
 assert.match(modal,/DELETE PERMANENTLY/);
 assert.match(modal,/recordDeletePhrase/);
 assert.match(modal,/requireConfirmation\(confirmation\.phrase,confirmation\.reason\)/);
 assert.match(modal,/ownerAudit/);
});
test("Directory search uses bounded queries and rejects stale company responses",()=>{
 const app=read("src/app.js");
 assert.match(app,/function scheduleDirectorySearch\(type\)/);
 assert.match(app,/startAt\(prefix\)/);
 assert.match(app,/endAt\(prefix\+"\\uf8ff"\)/);
 assert.match(app,/requestId!==remoteSearchId/);
});

test("owner can permanently delete finalized or voided payroll from its run row",()=>{
 const app=read("src/app.js"),owner=read("src/owner.js");
 assert.match(app,/actions\.push\(button\("Delete permanently",\(\)=>ownerActions\.remove\("payrollRuns",run\)/);
 assert.doesNotMatch(owner,/Void it instead of orphaning history/);
 assert.match(owner,/payrollRuns:\["lines","snapshots","revisions"\]/);
});
