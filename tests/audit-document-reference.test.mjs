import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=(path)=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
test("Payroll run rename always creates audit document from a collection",()=>{
 const source=read("src/app.js");
 assert.match(source,/const audit=doc\(collection\(db,"tenants",company,"auditEvents"\)\)/);
 assert.doesNotMatch(source,/doc\(db,"tenants",company,"auditEvents"\)/);
 assert.match(source,/transaction\.set\(audit,\{category:"payroll",action:"payroll-rename"/);
});
test("Company status writes an audit document, not an invalid odd-segment path",()=>{
 const source=read("src/app.js");
 assert.match(source,/batch\.set\(doc\(collection\(db,"tenants",c\.id,"auditEvents"\)\)/);
 assert.doesNotMatch(source,/doc\(db,"tenants",c\.id,"auditEvents"\)/);
});
test("Payroll hotfix uses fresh browser modules instead of stale cached scripts",()=>{
 const html=read("index.html"),app=read("src/app.js");
 assert.match(html,/app\.js\?v=sterling-ops30-hotfix-20261019/);
 assert.match(app,/operations-center\.js\?v=sterling-ops30-hotfix-20261019/);
 assert.match(app,/phase3\.js\?v=sterling-ops30-hotfix-20261019/);
});
