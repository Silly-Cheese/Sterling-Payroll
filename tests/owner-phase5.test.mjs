import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {correctedLine,correctedPeriod,reason,canHardDelete} from "../src/owner-core.js";
import {invoiceInput,ticketInput,summarizeInvoices} from "../src/phase5-core.js";
test("owner can revise finalized fictional payroll amount with balanced gross/net",()=>{
 const previous={employeeId:"a",employeeName:"Lee",regularCents:10000,overtimeCents:0,bonusCents:0,deductionCents:0,grossCents:10000,netCents:10000,regularHours:5,overtimeHours:0};
 const result=correctedLine(previous,{regular:"120.00",overtime:"20.00",bonus:"10.00",deduction:"15.00",regularHours:"6",overtimeHours:"1"});
 assert.equal(result.grossCents,15000);assert.equal(result.netCents,13500);
 assert.equal(previous.netCents,10000);
});
test("finalized period can be corrected in place or voided with checked dates",()=>{
 const run={periodStart:"2026-10-01",periodEnd:"2026-10-10",payDate:"2026-10-12",status:"finalized"};
 assert.equal(correctedPeriod(run,{...run,payDate:"2026-10-15"}).status,"finalized");
 assert.equal(correctedPeriod(run,{...run,status:"voided"}).status,"voided");
 assert.throws(()=>correctedPeriod(run,{...run,payDate:"2026-09-10"}));
});
test("owner operation reason and invalid payroll amounts are rejected",()=>{
 assert.throws(()=>reason("short"));
 assert.equal(reason("This is a documented correction."),"This is a documented correction.");
 assert.throws(()=>correctedLine({employeeId:"x"},{regular:"1",overtime:"0",bonus:"0",deduction:"100",regularHours:0,overtimeHours:0}));
 assert.equal(canHardDelete("payrollRuns",true),false);
 assert.equal(canHardDelete("payrollRuns",false),true);
});
test("Phase 5 simulates service invoices, not payment rails",()=>{
 assert.deepEqual(invoiceInput("Monthly subscription","99.99"),{description:"Monthly subscription",amountCents:9999});
 assert.throws(()=>invoiceInput("aa","5"));
 assert.deepEqual(ticketInput("Missing hours","Please review the fictional time sheet"),{subject:"Missing hours",details:"Please review the fictional time sheet"});
 const sum=summarizeInvoices([{status:"issued",amountCents:2500},{status:"settled",amountCents:5000},{status:"draft",amountCents:1000}]);
 assert.deepEqual(sum,{outstandingCents:2500,settledCents:5000,draftCount:1});
});
test("owner revisions and Phase 5 records are access-controlled in Firestore",()=>{
 const rules=fs.readFileSync(new URL("../firestore.rules",import.meta.url),"utf8");
 for(const phrase of ["match /ownerAudit/{auditId}","match /revisions/{revisionId}","validRevision(t,r,'line',employeeId)","match /billingInvoices/{invoiceId}","match /supportTickets/{ticketId}"])assert.ok(rules.includes(phrase));
 assert.ok(rules.includes("allow update,delete: if false;"));
});
test("every dynamically imported Phase 4 and Phase 5 file ships to GitHub Pages",()=>{
 const app=fs.readFileSync(new URL("../src/app.js",import.meta.url),"utf8");
 const workflow=fs.readFileSync(new URL("../.github/workflows/pages.yml",import.meta.url),"utf8");
 const html=fs.readFileSync(new URL("../index.html",import.meta.url),"utf8");
 for(const name of ["src/phase4.js","src/phase4-core.js","src/owner.js","src/owner-core.js","src/phase5.js","src/phase5-core.js"])assert.ok(workflow.includes(name));
 assert.match(app,/import\("\.\/phase4.js/);
 assert.match(app,/import\("\.\/owner.js/);
 assert.match(html,/id="page-owner"/);
 assert.match(html,/id="page-service"/);
});