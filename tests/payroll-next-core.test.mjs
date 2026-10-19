import test from "node:test";
import assert from "node:assert/strict";
import {schedulePeriods,validateProfile,currentCompensation,integrityReport,approvalQueue,
 reconcileRun,reportingRows,toCSV} from "../src/payroll-next-core.js";
import {buildPayrollPreview,DEFAULT_POLICY} from "../src/phase3-core.js";
const person={id:"employee-1",displayName:"Test Employee",status:"active",payType:"hourly",
 hourlyRateCents:1000,annualSalaryCents:0,payFrequency:"biweekly"};
test("weekly and semi-monthly schedules do not drift across calendar months",()=>{
 const base={cadence:"weekly",mode:"combined",anchorDate:"2026-10-26",paydayOffsetDays:2};
 const weeks=schedulePeriods(base,2);
 assert.equal(weeks[0].start,"2026-10-26");
 assert.equal(weeks[0].end,"2026-11-01");
 assert.equal(weeks[1].start,"2026-11-02");
 const semi=schedulePeriods({...base,cadence:"semimonthly",anchorDate:"2026-02-16"},2);
 assert.equal(semi[0].end,"2026-02-28");
 assert.equal(semi[1].end,"2026-03-15");
});
test("named salary and hourly compensation versions are immutable by effective date",()=>{
 const a=validateProfile({effectiveDate:"2026-10-01",payRate:"25.00",taxRatePercent:"5",
  recurringDeduction:"5.00",note:"Merit"},person);
 assert.equal(a.hourlyRateCents,2500);assert.equal(a.taxRateBasisPoints,500);
 assert.throws(()=>validateProfile({...a,effectiveDate:"2026-02-30",payRate:"25.00",
  taxRatePercent:"5",recurringDeduction:"5.00"},person),/not valid/);
 const versions=[{...a,effectiveDate:"2026-10-01"}, {...a,effectiveDate:"2026-11-01",hourlyRateCents:3000}];
 assert.equal(currentCompensation({versions},"2026-10-20").hourlyRateCents,2500);
 assert.equal(currentCompensation({versions},"2026-11-20").hourlyRateCents,3000);
});
test("effective pay rates, deductions and tax rates affect future draft preview only",()=>{
 const updated={employeeId:person.id,effectiveDate:"2026-10-01",payType:"hourly",
  hourlyRateCents:2500,taxRateBasisPoints:500,recurringDeductionCents:500};
 const preview=buildPayrollPreview({employees:[person],entries:[{id:"t1",employeeId:person.id,
  workDate:"2026-10-12",regularHours:8,overtimeHours:0,status:"approved"}],
  policy:DEFAULT_POLICY,start:"2026-10-12",end:"2026-10-18",compensationChanges:[updated]});
 assert.equal(preview.issues.length,0);
 assert.equal(preview.lines.length,1);
 assert.equal(preview.lines[0].regularCents,20000);
 assert.equal(preview.lines[0].taxRateBasisPoints,500);
 assert.equal(preview.lines[0].taxCents,1000);
 assert.equal(preview.lines[0].otherDeductionCents,500);
 assert.equal(preview.lines[0].netCents,18500);
 const historical=buildPayrollPreview({employees:[person],entries:[{id:"t1",employeeId:person.id,
  workDate:"2026-09-12",regularHours:8,overtimeHours:0,status:"approved"}],
  policy:DEFAULT_POLICY,start:"2026-09-12",end:"2026-09-18",compensationChanges:[updated]});
 assert.equal(historical.lines[0].regularCents,8000);
});
test("incomplete sources and orphaned records are always visible as exceptions",()=>{
 const findings=integrityReport({employees:[person],timeEntries:[{id:"bad",employeeId:"missing",workDate:"2026-10-12",
  regularHours:8,overtimeHours:0}],sales:[{id:"s",employeeId:person.id,status:"approved",paidRunId:""}],
  completeness:{employees:true,sales:false}});
 assert.equal(findings.complete,false);
 assert.ok(findings.issues.some(x=>x.type==="missing-employee"));
 assert.ok(findings.warnings.some(x=>x.type==="incomplete-coverage"));
 assert.ok(findings.warnings.some(x=>x.type==="unclaimed-commission"));
});
test("approval queues enforce separation of duties and never approve payroll by themselves",()=>{
 const queue=approvalQueue({timeEntries:[{id:"t",createdBy:"me",status:"pending",workDate:"2026-10-15"}],
  sales:[{id:"s",createdBy:"other",status:"pending",saleDate:"2026-10-15",commissionCents:1000}],
  runs:[{id:"r",status:"submitted",periodEnd:"2026-10-15",submittedBy:"other"}],uid:"me"});
 assert.equal(queue.find(x=>x.id==="t").eligible,false);
 assert.equal(queue.find(x=>x.id==="s").eligible,true);
 assert.equal(queue.find(x=>x.id==="r").kind,"run");
});
test("reconciliation flags wrong pay lines and missing claimed sales",()=>{
 const run={id:"run1",processingMode:"timecards-only"};
 const result=reconcileRun(run,[{employeeId:person.id,employeeName:person.displayName,grossCents:500,
  netCents:450,deductionCents:20,commissionCents:100}],[],[person],true);
 assert.ok(result.issues.some(x=>x.includes("does not reconcile")));
 assert.ok(result.issues.some(x=>x.includes("Unexpected commission")));
});
test("CSV exports protect commas and quotes",()=>{
 const rows=reportingRows({employees:[{...person,displayName:'McCoy, "Sam"'}]}).employees;
 const csv=toCSV(rows);
 assert.match(csv,/"McCoy, ""Sam"""/);
});
