import test from "node:test";
import assert from "node:assert/strict";
import {schedulePeriods,validatePeriodAgainstRuns,validateCompensationProfile,
 reconcileRun,payrollReadiness,validateGeneratedPayLines,CSV} from "../src/operations-core.js";
import {applyEffectiveCompensation} from "../src/profile-payroll.js";
const schedule={name:"October recurring payroll",cadence:"biweekly",processingMode:"timecards-only",nextStart:"2026-10-05",payDelay:3};
test("biweekly dates, next payday and historical overlaps",()=>{
 const periods=schedulePeriods(schedule,3);
 assert.deepEqual(periods.slice(0,2).map(x=>[x.periodStart,x.periodEnd,x.payDate]),[
  ["2026-10-05","2026-10-18","2026-10-21"],["2026-10-19","2026-11-01","2026-11-04"]
 ]);
 const collisions=validatePeriodAgainstRuns(periods[0],[{id:"p",periodStart:"2026-10-01",periodEnd:"2026-10-10",status:"finalized"}]);
 assert.equal(collisions.length,1);
 assert.equal(validatePeriodAgainstRuns(periods[0],[{periodStart:"2026-01-01",periodEnd:"2026-01-02",status:"finalized"}]).length,0);
});
test("semimonthly periods end on the 15th and final calendar day",()=>{
 const p=schedulePeriods({...schedule,cadence:"semimonthly",nextStart:"2026-02-01"},3);
 assert.deepEqual(p.map(x=>[x.periodStart,x.periodEnd]),[
  ["2026-02-01","2026-02-15"],["2026-02-16","2026-02-28"],["2026-03-01","2026-03-15"]
 ]);
});
test("schedule inputs and money inputs reject invalid fields",()=>{
 assert.throws(()=>schedulePeriods({...schedule,processingMode:"wrong"}),/source mode/);
 assert.throws(()=>schedulePeriods({...schedule,payDelay:31}),/0–30/);
 assert.throws(()=>validateCompensationProfile({employeeId:"e1",effectiveFrom:"2026-02-30",taxRateBasisPoints:1250,recurringDeductionCents:0}),/real calendar/);
});
test("effective-dated compensation never applies future settings to historical pay",()=>{
 const original={employeeId:"e1",employeeName:"Employee",regularCents:100000,overtimeCents:0,bonusCents:0,commissionCents:0,
  grossCents:100000,taxCents:0,deductionCents:0,netCents:100000};
 const history=[
  {employeeId:"e1",effectiveFrom:"2026-01-01",taxRateBasisPoints:1000,recurringDeductionCents:1000,changedAt:{seconds:1}},
  {employeeId:"e1",effectiveFrom:"2026-11-01",taxRateBasisPoints:1500,recurringDeductionCents:2200,changedAt:{seconds:2}}
 ];
 const before=applyEffectiveCompensation([original],history,"2026-10-31")[0];
 assert.equal(before.taxRateBasisPoints,1000);assert.equal(before.otherDeductionCents,1000);
 const after=applyEffectiveCompensation([original],history,"2026-11-30")[0];
 assert.equal(after.taxRateBasisPoints,1500);assert.equal(after.otherDeductionCents,2200);
 assert.equal(original.deductionCents,0);
});
test("integrity gate rejects forbidden wages in commission-only runs and mismatched net",()=>{
 const run={periodStart:"2026-10-01",periodEnd:"2026-10-31",processingMode:"commissions-only"};
 const line={employeeId:"e1",employeeName:"Agent",regularCents:0,overtimeCents:0,bonusCents:0,commissionCents:15000,
  regularHours:0,overtimeHours:0,paidLeaveHours:0,taxCents:1500,otherDeductionCents:0,deductionCents:1500,grossCents:15000,netCents:13500};
 assert.equal(validateGeneratedPayLines([line],run).ready,true);
 assert.equal(validateGeneratedPayLines([{...line,regularCents:1000}],run).ready,false);
 assert.equal(validateGeneratedPayLines([{...line,netCents:15500}],run).ready,false);
 const rec=reconcileRun({run,lines:[line],time:[],sales:[],employees:[{id:"e1"}],complete:true});
 assert.equal(rec.totals.netCents,13500);
 assert.equal(payrollReadiness({run,lines:[line],time:[],sales:[],employees:[{id:"e1"}],complete:false}).ready,false);
});
test("CSV escapes descriptions and keeps values separate",()=>{
 assert.match(CSV([["employee","description"],["Jane","Sold \"two\", items"]]),/"Sold ""two"", items"/);
});
