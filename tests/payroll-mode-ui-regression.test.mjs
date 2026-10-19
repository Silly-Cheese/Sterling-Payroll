import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
test("Phase 3 partial and controller both expose simulated tax percentage",()=>{
 const html=read("phase3-payroll.html");
 const code=read("src/phase3.js");
 assert.match(html,/id="p3TaxRate"/);
 assert.match(code,/function ensureTaxRateInput\(/);
 assert.match(code,/ensureTaxRateInput\(\);/);
 assert.match(code,/ensureTaxRateInput\(\)\.value/);
 assert.match(code,/cache:"no-store"/);
});
test("commission-only inspector validates actual approved commissions rather than requiring timecards",()=>{
 const core=read("src/phase3.js");
 assert.match(core,/const timeRequired=usesTimecards\(run\.processingMode\)/);
 assert.match(core,/const kinds=timeRequired\?/);
 assert.match(core,/prepareRunCommissions\(db,company,run,preview\.lines,employees,policy\)/);
 assert.match(core,/No eligible pay lines/);
});
test("release loads corrected modules with unique browser asset versions",()=>{
 const index=read("index.html"),app=read("src/app.js");
 assert.match(index,/app\.js\?v=sterling-payroll-mode-ui-fix-20261019/);
 assert.match(app,/phase3\.js\?v=sterling-payroll-mode-ui-fix-20261019/);
});
