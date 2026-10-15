import test from "node:test";
import assert from "node:assert/strict";
import {calculateLine,summarizeLines,toCents,money,hoursValue,canTransition,validPeriod} from "../src/payroll-core.js";

const hourly={id:"e1",displayName:"Alex Lee",status:"active",payType:"hourly",hourlyRateCents:2000,payFrequency:"biweekly",annualSalaryCents:0};
const salaried={id:"e2",displayName:"Jordan Price",status:"active",payType:"salary",annualSalaryCents:6240000,payFrequency:"biweekly",hourlyRateCents:0};
test("simulated cents parser never uses dollar floats",()=>{
 assert.equal(toCents("15.05"),1505);
 assert.equal(toCents("0.01"),1);
 assert.equal(money(1505),"$15.05");
 assert.throws(()=>toCents("-1"));
 assert.throws(()=>toCents("12.123"));
});
test("regular and 1.5x overtime calculations use integer cents",()=>{
 const line=calculateLine({employee:hourly,regularHours:40,overtimeHours:5,bonusCents:2500,deductionCents:1500});
 assert.equal(line.regularCents,80000);
 assert.equal(line.overtimeCents,15000);
 assert.equal(line.grossCents,97500);
 assert.equal(line.netCents,96000);
});
test("salary divides annual cents by period count",()=>{
 const line=calculateLine({employee:salaried});
 assert.equal(line.regularCents,240000);
 assert.equal(line.overtimeCents,0);
 assert.equal(line.netCents,240000);
});
test("invalid hours, inactive employees, excess deductions rejected",()=>{
 assert.equal(hoursValue(1.1),1.1);
 assert.throws(()=>hoursValue(-1));
 assert.throws(()=>hoursValue(2.333));
 assert.throws(()=>calculateLine({employee:{...hourly,status:"inactive"}}));
 assert.throws(()=>calculateLine({employee:hourly,regularHours:1,deductionCents:3000}));
});
test("duplicate employee lines fail rather than double-pay",()=>{
 const entry=calculateLine({employee:hourly,regularHours:1});
 assert.throws(()=>summarizeLines([entry,entry]),/Duplicate/);
});
test("separation of responsibilities guards approvals",()=>{
 const run={submittedBy:"preparer",approvedBy:"approver"};
 assert.equal(canTransition("submitted","approved","preparer",run,"client_admin"),false);
 assert.equal(canTransition("submitted","approved","approver",run,"client_admin"),true);
 assert.equal(canTransition("submitted","approved","viewer",run,"viewer"),false);
 assert.equal(canTransition("approved","finalized","approver",run,"client_admin"),false);
 assert.equal(canTransition("approved","finalized","preparer",run,"client_admin"),false);
 assert.equal(canTransition("approved","finalized","third",run,"client_admin"),true);
});
test("periods must have logical date order",()=>{
 assert.equal(validPeriod("2026-10-01","2026-10-14","2026-10-16"),true);
 assert.equal(validPeriod("2026-10-15","2026-10-14","2026-10-16"),false);
 assert.equal(validPeriod("2026-10-01","2026-10-14","2026-10-10"),false);
});
