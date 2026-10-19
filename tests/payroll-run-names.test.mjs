import test from "node:test";
import assert from "node:assert/strict";
import {normalizePayrollRunName,payrollRunLabel,payrollRunSubtitle} from "../src/payroll-run-names.js";
test("run name is optional on creation and normalized for renaming",()=>{
 assert.equal(normalizePayrollRunName("",{optional:true}),"");
 assert.equal(normalizePayrollRunName("   October    Regular Payroll  "),"October Regular Payroll");
 assert.throws(()=>normalizePayrollRunName(""),/Enter a payroll run name/);
 assert.throws(()=>normalizePayrollRunName("A".repeat(81)),/80 characters/);
});
test("legacy pay runs without custom names still show dates",()=>{
 assert.equal(payrollRunLabel({periodStart:"2026-10-01",periodEnd:"2026-10-14"}),"2026-10-01 — 2026-10-14");
 assert.equal(payrollRunSubtitle({periodStart:"2026-10-01",periodEnd:"2026-10-14"}),"");
});
test("named runs display the name and preserve their original period label",()=>{
 const run={name:"October Regular",periodStart:"2026-10-01",periodEnd:"2026-10-14"};
 assert.equal(payrollRunLabel(run),"October Regular");
 assert.equal(payrollRunSubtitle(run),"2026-10-01 — 2026-10-14");
});
