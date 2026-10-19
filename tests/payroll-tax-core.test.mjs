import test from "node:test";
import assert from "node:assert/strict";
import {taxBasisPoints,calculateTaxCents,calculateTaxAdjustment,applySimulatedTaxes} from "../src/payroll-tax-core.js";
import {buildPayrollPreview,validatePolicy,DEFAULT_POLICY,csvStatement} from "../src/phase3-core.js";
import {paystubHtml} from "../src/phase4-core.js";
const sample={employeeId:"emp",employeeName:"Taylor",regularCents:100000,overtimeCents:10000,commissionCents:20000,bonusCents:0,deductionCents:0,grossCents:130000,netCents:130000};
test("accept two-decimal percent rates and reject impossible or malformed rates",()=>{
 assert.equal(taxBasisPoints("12.5"),1250);
 assert.equal(taxBasisPoints("0"),0);
 assert.equal(taxBasisPoints("100.00"),10000);
 for(const invalid of ["-1","101","12.345","abc",""])
  assert.throws(()=>taxBasisPoints(invalid),/percent/i);
});
test("12.5% fictional taxes are based on final gross including commissions and bonuses",()=>{
 const result=calculateTaxAdjustment(sample,"50.00","25.00","12.50");
 assert.equal(result.grossCents,135000);
 assert.equal(result.taxCents,16875);
 assert.equal(result.otherDeductionCents,2500);
 assert.equal(result.deductionCents,19375);
 assert.equal(result.netCents,115625);
});
test("preview tax recalculates when commissions increase gross",()=>{
 const before=applySimulatedTaxes([{...sample,commissionCents:0,grossCents:110000,netCents:110000}],1250)[0];
 const after=applySimulatedTaxes([{...before,commissionCents:20000,grossCents:130000,netCents:130000-before.deductionCents}],1250)[0];
 assert.equal(before.taxCents,13750);
 assert.equal(after.taxCents,16250);
 assert.equal(after.deductionCents,16250);
 assert.equal(after.netCents,113750);
 assert.equal(applySimulatedTaxes([after],1250)[0].taxCents,16250);
});
test("policy keeps compatibility with older policy records that lack tax fields",()=>{
 assert.equal(validatePolicy(DEFAULT_POLICY).defaultTaxRateBasisPoints,0);
 const previous={version:2,overtimeMultiplierHundredths:150,defaultBonusCents:0,defaultDeductionCents:0,requireApprovedTime:true};
 assert.equal(validatePolicy(previous).defaultTaxRateBasisPoints,0);
 assert.equal(validatePolicy({...previous,defaultTaxRateBasisPoints:1700}).defaultTaxRateBasisPoints,1700);
 assert.throws(()=>validatePolicy({...previous,defaultTaxRateBasisPoints:10001}),/tax rate/i);
});
test("a simulated tax amount cannot make net pay negative",()=>{
 assert.throws(()=>calculateTaxAdjustment(sample,"0","500","100"),/cannot exceed gross/);
 assert.throws(()=>applySimulatedTaxes([{...sample,deductionCents:90000}],5000),/exceed gross/);
});
test("zero rate preserves older fixed deductions and new statements remain reconcilable",()=>{
 const legacy={...sample,deductionCents:1800,netCents:128200};
 const line=applySimulatedTaxes([legacy],0)[0];
 assert.equal(line.taxCents,0);
 assert.equal(line.otherDeductionCents,1800);
 assert.equal(line.netCents,128200);
 const run={status:"finalized",periodStart:"2026-10-12",periodEnd:"2026-10-17",payDate:"2026-10-18"};
 const statement=paystubHtml("Sterling Motors",run,line);
 assert.match(statement,/Simulated taxes/);
 assert.match(statement,/Other deductions/);
 const csv=csvStatement({company:"Sterling Motors",run,lines:[line]});
 assert.match(csv,/Tax rate \(\%\)/);
});
test("taxes are applied to an approved time entry without changing the approval rule",()=>{
 const employee={id:"e",displayName:"Taylor",status:"active",payType:"hourly",hourlyRateCents:2000};
 const preview=buildPayrollPreview({employees:[employee],entries:[{id:"t",employeeId:"e",workDate:"2026-10-14",regularHours:8,overtimeHours:0,status:"approved"}],
 start:"2026-10-12",end:"2026-10-17",policy:{...DEFAULT_POLICY,defaultTaxRateBasisPoints:1250}});
 assert.equal(preview.issues.length,0);
 assert.equal(preview.lines.length,1);
 assert.equal(preview.lines[0].grossCents,16000);
 assert.equal(preview.lines[0].taxCents,2000);
 assert.equal(preview.lines[0].netCents,14000);
});
