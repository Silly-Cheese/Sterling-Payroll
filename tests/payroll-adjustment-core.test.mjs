import test from "node:test";
import assert from "node:assert/strict";
import {calculateDraftAdjustment} from "../src/payroll-adjustment-core.js";
const line={employeeId:"a",regularCents:100000,overtimeCents:20000,commissionCents:3500,bonusCents:0,deductionCents:0};
test("adjustments preserve commission, base and overtime",()=>{
 assert.deepEqual(calculateDraftAdjustment(line,"175.25","125.00"),
 {bonusCents:17525,deductionCents:12500,grossCents:141025,netCents:128525});
});
test("rejects deduction beyond gross and negative or malformed money",()=>{
 assert.throws(()=>calculateDraftAdjustment(line,"0","1500"),/exceed gross/);
 assert.throws(()=>calculateDraftAdjustment(line,"-1","0"),/valid dollar/);
 assert.throws(()=>calculateDraftAdjustment(line,"0.009","0"),/valid dollar/);
});
test("commission is optional for older legacy lines",()=>{
 const {grossCents}=calculateDraftAdjustment({...line,commissionCents:undefined},"0","0");
 assert.equal(grossCents,120000);
});
