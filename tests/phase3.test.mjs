import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {DEFAULT_POLICY,validatePolicy,buildPayrollPreview,validateCorrection,validateLeave,csvStatement} from "../src/phase3-core.js";
const employee={id:"employee-1",displayName:"Morgan Taylor",status:"active",payType:"hourly",hourlyRateCents:2000,annualSalaryCents:0,payFrequency:"biweekly"};
const time={id:"entry-1",employeeId:employee.id,workDate:"2026-10-12",status:"approved",regularHours:8,overtimeHours:2};
const period={employees:[employee],entries:[time],start:"2026-10-01",end:"2026-10-14",policy:DEFAULT_POLICY};
test("Phase 3 requires independently approved time before payroll",()=>{
 const p=buildPayrollPreview({...period,entries:[{...time,status:"pending"}]});
 assert.equal(p.lines.length,0);
 assert.ok(p.issues.some(x=>x.kind==="unapproved-time"));
});
test("Phase 3 computes reviewed hourly regular and overtime",()=>{
 const result=buildPayrollPreview(period);
 assert.equal(result.issues.length,0);
 assert.equal(result.lines.length,1);
 assert.equal(result.lines[0].regularCents,16000);
 assert.equal(result.lines[0].overtimeCents,6000);
 assert.equal(result.totals.grossCents,22000);
});
test("Approved corrections and approved leave affect fictional gross",()=>{
 const corrections=[{id:"correction-1",timeEntryId:time.id,status:"approved",regularHours:10,overtimeHours:1}];
 const leaveRequests=[{id:"leave-1",employeeId:employee.id,status:"approved",date:"2026-10-13",hours:4}];
 const result=buildPayrollPreview({...period,corrections,leaveRequests});
 assert.equal(result.lines[0].regularCents,28000);
 assert.equal(result.lines[0].overtimeCents,3000);
 assert.equal(result.lines[0].paidLeaveHours,4);
});
test("Multiple approved corrections block payroll rather than choose arbitrary data",()=>{
 const corrections=[{id:"1",timeEntryId:time.id,status:"approved",regularHours:8,overtimeHours:0},
 {id:"2",timeEntryId:time.id,status:"approved",regularHours:8,overtimeHours:0}];
 const result=buildPayrollPreview({...period,corrections});
 assert.equal(result.lines.length,0);
 assert.ok(result.issues.some(x=>x.kind==="conflicting-corrections"));
});
test("Approved leave outside the payroll period cannot inflate wages",()=>{
 const result=buildPayrollPreview({...period,leaveRequests:[{id:"l",employeeId:employee.id,status:"approved",date:"2026-09-01",hours:8}]});
 assert.equal(result.totals.grossCents,22000);
});
test("Policy validation and exception details",()=>{
 assert.throws(()=>validatePolicy({...DEFAULT_POLICY,overtimeMultiplierHundredths:350}));
 assert.throws(()=>validatePolicy({...DEFAULT_POLICY,requireApprovedTime:false}));
 const policy=validatePolicy({...DEFAULT_POLICY,version:2,defaultBonusCents:1000,defaultDeductionCents:500});
 const result=buildPayrollPreview({...period,policy});
 assert.equal(result.totals.grossCents,23000);
 assert.equal(result.totals.netCents,22500);
});
test("Time corrections and paid leave validate bounded input",()=>{
 assert.deepEqual(validateCorrection({regularHours:"2.5",overtimeHours:"0",reason:"Shift adjustment"}),{regularHours:2.5,overtimeHours:0,reason:"Shift adjustment"});
 assert.throws(()=>validateCorrection({regularHours:1,overtimeHours:0,reason:"no"}));
 assert.throws(()=>validateLeave({date:"2026-10-12",hours:25,reason:"Medical appointment"}));
});
test("Pay statement is clearly labeled simulation",()=>{
 const result=buildPayrollPreview(period);
 const csv=csvStatement({company:"Demo Client",run:{periodStart:"2026-10-01",periodEnd:"2026-10-14",payDate:"2026-10-16"},lines:result.lines});
 assert.match(csv,/SIMULATED PAY ONLY/);
 assert.match(csv,/Demo Client/);
 assert.match(csv,/Morgan Taylor/);
});
test("New staff grants require owner and do not arise from signup",()=>{
 const rules=fs.readFileSync(new URL("../firestore.rules",import.meta.url),"utf8");
 const app=fs.readFileSync(new URL("../src/app.js",import.meta.url),"utf8");
 assert.match(rules,/match \/platformStaff\/{uid}/);
 assert.match(rules,/allow create: if owner\(\) && exists/);
 assert.match(rules,/request\.resource\.data\.accountType == 'client'/);
 assert.doesNotMatch(app,/sendEmailVerification|emailVerified/);
});
test("All new Phase 3 assets are included in GitHub Pages deployment",()=>{
 const workflow=fs.readFileSync(new URL("../.github/workflows/pages.yml",import.meta.url),"utf8");
 for(const file of ["phase3-time.html","phase3-payroll.html","src/phase3.js","src/phase3-core.js","src/staff.js"])assert.ok(workflow.includes(file));
});