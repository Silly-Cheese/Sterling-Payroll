import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {paystubHtml,validatePreferences,recentFinalized,sanitizeStatementLine} from "../src/phase4-core.js";
const validLine={employeeId:"worker1",employeeName:"Morgan Taylor",regularCents:40000,overtimeCents:3000,bonusCents:1500,deductionCents:1000,grossCents:44500,netCents:43500,regularHours:20,overtimeHours:1};
const run={status:"finalized",periodStart:"2026-10-01",periodEnd:"2026-10-14",payDate:"2026-10-17"};
test("Only a finalized fictional run can produce an employee paystub",()=>{
 const html=paystubHtml("Sterling Motors",run,validLine);
 assert.match(html,/SIMULATED PAYSTUB/);
 assert.match(html,/NOT A REAL PAYMENT/);
 assert.ok(html.includes('$435.00'));
 assert.throws(()=>paystubHtml("Sterling Motors",{...run,status:"draft"},validLine));
});
test("Statement output escapes potentially malicious employee/company text",()=>{
 const html=paystubHtml('<img src=x onerror=alert(1)>',run,{...validLine,employeeName:'</p><script>bad()</script>'});
 assert.doesNotMatch(html,/<script>bad/);
 assert.doesNotMatch(html,/<img src=x/);
 assert.match(html,/&lt;script&gt;/);
});
test("Employee statement rejects inconsistent gross/net amounts",()=>{
 assert.throws(()=>sanitizeStatementLine({...validLine,netCents:99999}),/reconcile/);
 assert.throws(()=>sanitizeStatementLine({...validLine,grossCents:-1}),/Invalid/);
});
test("Employee self-service cannot write arbitrary fields",()=>{
 assert.deepEqual(validatePreferences({preferredName:"  M  ",notifications:true}),{preferredName:"M",notifications:true});
 assert.throws(()=>validatePreferences({preferredName:"x".repeat(81),notifications:true}));
 assert.throws(()=>validatePreferences({preferredName:"M",notifications:"yes"}));
});
test("Only finalized runs are included in employee pay history",()=>{
 const runs=[{status:"draft",periodEnd:"2026-10-20"},{status:"finalized",periodEnd:"2026-10-10"},{status:"finalized",periodEnd:"2026-10-15"}];
 assert.deepEqual(recentFinalized(runs).map(r=>r.periodEnd),["2026-10-15","2026-10-10"]);
});
test("Employee roles cannot list all employees or payroll lines",()=>{
 const rules=fs.readFileSync(new URL("../firestore.rules",import.meta.url),"utf8");
 assert.match(rules,/function clientView\(t\)\{return platformView\(\) \|\| \(member\(t\) && role\(t\) != 'employee'\);\}/);
 assert.match(rules,/function ownsEmployee\(t,e\)/);
 assert.match(rules,/match \/employees\/\{e\} \{\s*allow get: if clientView\(t\) \|\| ownsEmployee\(t,e\);\s*allow list: if clientView\(t\);/);
 assert.match(rules,/match \/lines\/\{employeeId\} \{\s*allow get: if clientView\(t\) \|\| \(ownsEmployee\(t,employeeId\)/);
 assert.match(rules,/get\(runPath\(t,r\)\)\.data\.status == 'finalized'/);
 assert.match(rules,/match \/employeeLinks\/\{uid\}/);
 assert.match(rules,/allow create, update: if clientAdmin\(t\)/);
});
test("Employee account UI bypasses employer-only personnel queries",()=>{
 const app=fs.readFileSync(new URL("../src/app.js",import.meta.url),"utf8");
 assert.match(app,/if\(!state.tenantId\|\|state.role==="employee"\)return;/);
 assert.match(app,/go\(state.role==="employee"\?"employeePortal":"dashboard"\)/);
 assert.doesNotMatch(app,/sendEmailVerification/);
});
test("Employee portal files shipped with Pages deployment",()=>{
 const workflow=fs.readFileSync(new URL("../.github/workflows/pages.yml",import.meta.url),"utf8");
 for(const file of ["phase4.html","src/phase4.js","src/phase4-core.js"])assert.ok(workflow.includes(file));
});

test("Phase 4 acknowledgment requests are limited to linked employees",()=>{
 const rules=fs.readFileSync(new URL("../firestore.rules",import.meta.url),"utf8");
 const portal=fs.readFileSync(new URL("../src/phase4.js",import.meta.url),"utf8");
 const template=fs.readFileSync(new URL("../phase4.html",import.meta.url),"utf8");
 assert.match(rules,/match \/employeeRequests\/\{uid\}\/items\/\{requestId\}/);
 assert.match(rules,/request\.auth\.uid == uid && employeeLinked\(t\)/);
 assert.match(rules,/resource\.data\.status == 'pending' && request\.resource\.data\.status == 'submitted'/);
 assert.match(rules,/request\.resource\.data\.diff\(resource\.data\)\.affectedKeys\(\)\.hasOnly\(\['status','response','updatedAt'\]\)/);
 assert.match(portal,/async function fetchRequests\(uid,version\)/);
 assert.match(portal,/addDoc\(coll\("employeeRequests",threadUid,"items"\)/);
 assert.match(template,/id="p4Requests"/);
});
