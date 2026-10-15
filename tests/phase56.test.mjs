import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {PLANS,agreementInput,ledgerEvent,invoiceBalance,canChangeInvoice,canChangeTicket,serviceStats,invoicesCsv,ticketInput} from "../src/phase5-core.js";
import {retentionPolicy,assessIntegrity,exportPackage,sanitizeRows,reportMetrics} from "../src/phase6-core.js";
test("service plan rates and billing lifecycle validate",()=>{
 const annual=agreementInput({tier:"enterprise",billingCycle:"annual",status:"active",renewalDate:"2027-12-01",seats:"150"});
 assert.equal(annual.rateCents,PLANS.enterprise.annualCents);
 assert.equal(annual.seatLimit,150);
 assert.throws(()=>agreementInput({tier:"fake",billingCycle:"monthly",status:"active"}));
 assert.throws(()=>agreementInput({tier:"starter",billingCycle:"monthly",status:"active",seats:-10}));
});
test("simulated immutable ledger math and state transitions",()=>{
 const events=[ledgerEvent("payment","20.00","Simulated customer payment"),ledgerEvent("credit","10.00","Courtesy simulated credit"),ledgerEvent("adjustment","5.00","Added fictional service")];
 const result=invoiceBalance({amountCents:5000},events);
 assert.equal(result.balanceCents,2500);
 assert.equal(result.paidCents,2000);assert.equal(result.creditCents,1000);
 assert.equal(canChangeInvoice("draft","issued"),true);
 assert.equal(canChangeInvoice("issued","settled"),true);
 assert.equal(canChangeInvoice("void","issued"),false);
 assert.equal(canChangeInvoice("draft","settled"),false);
 assert.equal(canChangeTicket("closed","open"),false);
 assert.throws(()=>ledgerEvent("unknown","10.00","Invalid entry"));
});
test("support priority metrics detect missed simulated targets",()=>{
 const now=Date.UTC(2026,9,14,12);
 const t=ticketInput("Payroll run question","Sample fictional processing question","high","payroll");
 assert.equal(t.priority,"high");
 const s=serviceStats([{status:"issued",amountCents:10000}],[{...t,status:"open",createdAt:{seconds:(now-5*3600000)/1000}}],now);
 assert.equal(s.overdueCases,1);
 assert.equal(s.outstandingCents,10000);
});
test("statement CSV is properly escaped and labeled simulation",()=>{
 const csv=invoicesCsv('Example "Business"',[{description:"Fixed, recurring plan",status:"issued",amountCents:12900,dueDate:"2026-10-20"}]);
 assert.match(csv,/SIMULATED INVOICES/);
 assert.match(csv,/"Example ""Business"""/);
 assert.match(csv,/"Fixed, recurring plan"/);
});
test("Phase 6 detects orphaned time, broken payroll lines and truncated coverage",()=>{
 const result=assessIntegrity({employees:[{id:"a",displayName:"Alex",status:"active"}],
  timeEntries:[{id:"t",employeeId:"missing",workDate:"2026-10-14",regularHours:8,overtimeHours:0}],
  runs:[{id:"r",periodStart:"2026-10-01",periodEnd:"2026-10-14",status:"finalized",finalizedBy:"u"}],
  linesByRun:{r:[{regularCents:100,overtimeCents:0,bonusCents:0,deductionCents:0,grossCents:99,netCents:99}]},
  partial:{timeEntries:true}});
 assert.equal(result.complete,false);
 assert.ok(result.issues.some(s=>s.includes("employee")));
 assert.ok(result.issues.some(s=>s.includes("does not reconcile")));
 assert.ok(result.warnings.some(s=>s.includes("partial")));
});
test("Phase 6 client export excludes private account credentials and messages",()=>{
 const batch=exportPackage({client:{id:"t",name:"Example",servicePlan:"standard",contactEmail:"sensitive@example.com"},
  collections:{employees:[{id:"1",displayName:"Alex",bankAccount:"do not export"}],supportTickets:[{id:"s",subject:"Question",secretAuthToken:"excluded"}]}});
 assert.match(batch.notice,/SIMULATED DATA ONLY/);
 assert.equal(batch.client.contactEmail,undefined);
 assert.equal(batch.data.employees[0].bankAccount,undefined);
 assert.equal(batch.data.supportTickets[0].secretAuthToken,undefined);
 assert.throws(()=>sanitizeRows("secrets",[]));
});
test("retention settings do not permit unapproved duration",()=>{
 assert.deepEqual(retentionPolicy("365",true),{reviewAfterDays:365,legalHold:true});
 assert.throws(()=>retentionPolicy(1,false));
});
test("deployment publishes all Phase 5/6 templates and source code",()=>{
 const yml=fs.readFileSync(new URL("../.github/workflows/pages.yml",import.meta.url),"utf8");
 const index=fs.readFileSync(new URL("../index.html",import.meta.url),"utf8");
 for(const file of ["phase5.html","phase6.html","src/phase5.js","src/phase6.js","src/phase6-core.js"])assert.ok(yml.includes(file));
 assert.match(index,/page-assurance/);assert.match(index,/openQuickNav/);
});
test("Phase 5/6 Security Rules restrict internal notes and immutable transactions",()=>{
 const rules=fs.readFileSync(new URL("../firestore.rules",import.meta.url),"utf8");
 assert.match(rules,/match \/internalNotes\/\{noteId\} \{\s*allow read: if clientAdmin\(t\)/);
 assert.match(rules,/match \/events\/\{eventId\} \{[\s\S]*?allow update: if false;\s*allow delete: if owner\(\);/);
 assert.match(rules,/match \/assuranceSettings\/current/);
 assert.match(rules,/match \/auditEvents\/\{eventId\}/);
});