import test from "node:test";
import assert from "node:assert/strict";
import {normalizePayrollRunMode,usesTimecards,usesCommissions,payrollRunModeLabel,emptyCommissionLine} from "../src/payroll-run-modes.js";
import {attachApprovedSales} from "../src/commission-core.js";
import {applySimulatedTaxes} from "../src/payroll-tax-core.js";
test("legacy payroll remains combined and new runs accept only defined modes",()=>{
 assert.equal(normalizePayrollRunMode(undefined,{legacy:true}),"combined");
 assert.throws(()=>normalizePayrollRunMode(undefined),/valid payroll/);
 assert.throws(()=>normalizePayrollRunMode("commission"),/valid payroll/);
 assert.equal(usesTimecards("timecards-only"),true);
 assert.equal(usesCommissions("timecards-only"),false);
 assert.equal(usesTimecards("commissions-only"),false);
 assert.equal(usesCommissions("commissions-only"),true);
 assert.equal(usesCommissions("combined"),true);
 assert.equal(payrollRunModeLabel("commissions-only"),"Commissions only");
});
test("commission-only pay line never includes salary wages, hours, leave or bonus",()=>{
 const employee={id:"salary-employee",displayName:"Morgan",status:"active",payType:"salary",annualSalaryCents:9000000,payFrequency:"monthly"};
 const policy={version:2,defaultTaxRateBasisPoints:1250,defaultBonusCents:50000,defaultDeductionCents:20000};
 const zero=emptyCommissionLine(employee,policy);
 assert.equal(zero.regularCents,0);
 assert.equal(zero.overtimeCents,0);
 assert.equal(zero.bonusCents,0);
 assert.equal(zero.paidLeaveHours,0);
 assert.equal(zero.otherDeductionCents,0);
 const attached=attachApprovedSales([zero],[{id:"sale",employeeId:employee.id,status:"approved",saleDate:"2026-10-17",commissionCents:28000}],"2026-10-12","2026-10-18");
 const taxed=applySimulatedTaxes(attached.lines,policy.defaultTaxRateBasisPoints)[0];
 assert.equal(taxed.regularCents,0);
 assert.equal(taxed.commissionCents,28000);
 assert.equal(taxed.taxCents,3500);
 assert.equal(taxed.grossCents,28000);
 assert.equal(taxed.netCents,24500);
});
test("commission-only lines reject inactive or unsupported employees",()=>{
 assert.throws(()=>emptyCommissionLine({id:"x",status:"inactive",payType:"hourly"},{}),/active/);
 assert.throws(()=>emptyCommissionLine({id:"x",status:"active",payType:"contractor"},{}),/compensation type/);
});
