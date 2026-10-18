import test from "node:test";
import assert from "node:assert/strict";
import {summarizePayrollWorkspace,payrollNextSteps,payrollRunSteps} from "../src/payroll-workflow.js";
test("counts only relevant outstanding records",()=>{
 const data={tenantId:"c",employees:[{status:"active"},{status:"inactive"}],
 time:[{status:"pending"},{status:"approved"}],
 runs:[{status:"draft"},{status:"submitted"},{status:"approved"},{status:"finalized"}]};
 const totals=summarizePayrollWorkspace(data);
 assert.equal(totals.employees,1);assert.equal(totals.pendingTime,1);
 assert.equal(totals.submittedRuns,1);assert.equal(totals.approvedRuns,1);
 assert.deepEqual(payrollNextSteps(data).slice(0,2).map(x=>x.id),["time","approve"]);
});
test("unloaded pages never masquerade as exhaustive results",()=>{
 const steps=payrollNextSteps({tenantId:"tenant",time:[],runs:[],moreTime:true});
 assert.ok(steps.some(x=>x.id==="coverage"));
 assert.match(steps.find(x=>x.id==="coverage").detail,/not yet loaded/i);
});
test("viewers and employees cannot be shown false action queues",()=>{
 assert.equal(payrollNextSteps({role:"employee",tenantId:"t",time:[{status:"pending"}]})[0].page,"employeePortal");
 assert.equal(payrollNextSteps({tenantId:""})[0].id,"choose-company");
});
test("run stages follow workflow status",()=>{
 assert.equal(payrollRunSteps({status:"submitted"})[2].current,true);
 assert.equal(payrollRunSteps({status:"approved"})[3].current,true);
 assert.equal(payrollRunSteps({status:"finalized"})[3].complete,true);
 assert.equal(payrollRunSteps({status:"rejected"})[1].current,true);
});
