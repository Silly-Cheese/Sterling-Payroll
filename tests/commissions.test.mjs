import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {commissionAmount,percentBasisPoints,addCommissionToLine,attachApprovedSales} from "../src/commission-core.js";
import {correctedLine} from "../src/owner-core.js";
const read=path=>fs.readFileSync(new URL("../"+path,import.meta.url),"utf8");
test("percentage commissions follow sale amount and fixed commissions pay per sale",()=>{
 const percentage={active:true,type:"percent",rateBasisPoints:750,fixedCents:0};
 const fixed={active:true,type:"fixed",rateBasisPoints:0,fixedCents:2500};
 assert.equal(percentBasisPoints("7.50"),750);
 assert.equal(commissionAmount(120000,percentage),9000);
 assert.equal(commissionAmount(120000,fixed),2500);
 assert.equal(commissionAmount(1,{...percentage,rateBasisPoints:5000}),1);
 assert.throws(()=>percentBasisPoints("-1"));
 assert.throws(()=>percentBasisPoints("101"));
 assert.throws(()=>commissionAmount(100,{...percentage,active:false}));
 assert.throws(()=>commissionAmount(-20,fixed));
});
test("approved commissions increase simulated gross and net without changing base bonus",()=>{
 const line={employeeId:"worker",employeeName:"Worker",regularCents:12000,overtimeCents:0,bonusCents:2000,
  deductionCents:1000,grossCents:14000,netCents:13000};
 const sale={id:"sale1",employeeId:"worker",status:"approved",saleDate:"2026-10-11",commissionCents:4500};
 const out=attachApprovedSales([line],[sale,{...sale,id:"future",saleDate:"2026-12-12"}],"2026-10-01","2026-10-14");
 assert.equal(out.commissionCents,4500);
 assert.equal(out.applied.length,1);
 assert.equal(out.lines[0].regularCents,12000);
 assert.equal(out.lines[0].bonusCents,2000);
 assert.equal(out.lines[0].commissionCents,4500);
 assert.equal(out.lines[0].grossCents,18500);
 assert.equal(out.lines[0].netCents,17500);
 const corrected=correctedLine(out.lines[0],{regular:"125.00",overtime:"0.00",bonus:"20.00",deduction:"10.00",regularHours:"5",overtimeHours:"0"});
 assert.equal(corrected.commissionCents,4500);
 assert.equal(corrected.grossCents,19000);
});
test("sale not represented by an employee pay line cannot disappear silently",()=>{
 assert.throws(()=>attachApprovedSales([],[{id:"missing",employeeId:"x",status:"approved",saleDate:"2026-10-10",commissionCents:100}],"2026-10-01","2026-10-14"));
 assert.throws(()=>addCommissionToLine({grossCents:1000000000,deductionCents:0},500));
});
test("commissions remain tenant-scoped and optional in code and rules",()=>{
 const rules=read("firestore.rules"),app=read("src/app.js"),site=read("index.html");
 for(const c of ["commissionSettings/current","commissionPlans/{employeeId}","commissionSales/{saleId}"])assert.ok(rules.includes(c));
 assert.match(rules,/match \/commissionSales\/\{saleId\} \{[\s\S]*?allow get,list: if payrollStaff\(t\)/);
 assert.match(app,/prepareRunCommissions\(db,tenantId,run,preview\.lines,state\.employees\)/);
 assert.match(app,/commitRunCommissions\(batch,run\.id,commission\)/);
 assert.match(site,/data-page="commissions"/);
 assert.match(read("src/deletion-engine.js"),/updates\.set\(sale\.ref\.path/);
});
test("startup dialogs mount on HTML body, never directly on Document",()=>{
 const ui=read("src/workspace-ui.js");
 assert.match(ui,/root\.nodeType===9\?root\.body:root/);
 assert.match(ui,/mount\.append\(dialog\)/);
 assert.doesNotMatch(ui,/root\.append\(dialog\)/);
});
test("commission modules and template are checked into published Pages bundle",()=>{
 const publish=read(".github/workflows/pages.yml"),verify=read(".github/workflows/verify.yml");
 for(const asset of ["commissions.html","src/commissions.js","src/commission-core.js","src/commission-payroll.js"])
  assert.ok(publish.includes(asset),asset);
 assert.match(verify,/node --check src\/commissions\.js/);
});
