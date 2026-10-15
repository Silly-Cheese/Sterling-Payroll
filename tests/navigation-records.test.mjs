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
 assert.match(manage,/createDeletionEngine/);
 assert.match(manage,/engine\.plan\(kind,record\.id/);
 assert.match(manage,/engine\.execute\(plan,approval\.reason\)/);
});
test("Historical payroll, ledger and communication records cannot be orphaned",()=>{
 const module=read("src/deletion-engine.js");
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

test("Owner deletion uses the shared custom modal with typed phrase",()=>{
 const dialogs=read("src/modals.js"),manager=read("src/record-actions.js"),app=read("src/app.js");
 assert.match(dialogs,/DELETE PERMANENTLY/);
 assert.match(dialogs,/deleteRecord/);
 assert.match(dialogs,/saCancel/);
 assert.match(manager,/requestDeletion\(\{/);
 assert.match(manager,/engine\.execute\(plan,approval\.reason\)/);
 assert.match(app,/createSterlingModals\(\)/);
});
test("Owner page removed without losing contextual authority",()=>{
 const html=read("index.html"),app=read("src/app.js"),owner=read("src/owner.js");
 assert.doesNotMatch(html,/data-page="owner"/);
 assert.doesNotMatch(html,/id="page-owner"/);
 assert.match(html,/id="sterlingRecordDialog"/);
 assert.match(app,/openOwnerReview/);
 assert.match(app,/openPayrollEditor/);
 assert.match(owner,/async function openPeriod/);
 assert.match(owner,/dialog\.showModal\(\)/);
});
test("Directory search uses bounded queries and rejects stale company responses",()=>{
 const app=read("src/app.js");
 assert.match(app,/function scheduleDirectorySearch\(type\)/);
 assert.match(app,/startAt\(prefix\)/);
 assert.match(app,/endAt\(prefix\+"\\uf8ff"\)/);
 assert.match(app,/requestId!==remoteSearchId/);
});

test("owner can permanently delete finalized or voided payroll from its run row",()=>{
 const app=read("src/app.js"),engine=read("src/deletion-engine.js");
 assert.match(app,/actions\.push\(button\("Delete permanently",\(\)=>ownerActions\.remove\("payrollRuns",run\)/);
 assert.match(engine,/payrollRuns:\["lines","snapshots","revisions"\]/);
 assert.match(engine,/kind==="payrollRuns"/);
});

test("user workflows hide creation forms until requested and preserve role gating",()=>{
 const app=read("src/app.js"),portal=read("src/phase4.js"),service=read("src/phase5.js");
 const html=read("index.html"),deploy=read(".github/workflows/pages.yml");
 assert.match(app,/compactForm\(\{formId,label,summary\}\)/);
 assert.match(service,/compactForm\(\{root,formId:"p5InvoiceForm"/);
 assert.match(service,/compactForm\(\{root,formId:"p5TicketForm"/);
 assert.match(portal,/buildPortalTabs\(root,/);
 assert.doesNotMatch(html,/data-page="owner"/);
 for(const file of ["src/modals.js","src/deletion-engine.js","src/workspace-ui.js"])assert.ok(deploy.includes(file));
});
test("employee portal has one requests panel and one request loader",()=>{
 const html=read("phase4.html"),app=read("src/phase4.js");
 assert.equal((html.match(/id="p4Requests"/g)||[]).length,1);
 assert.equal((html.match(/id="p4RequestsPanel"/g)||[]).length,1);
 assert.equal((app.match(/async function fetchRequests\(/g)||[]).length,1);
});
