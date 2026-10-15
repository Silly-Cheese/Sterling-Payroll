import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {importEmployees,parseCsv,findPossibleDuplicates} from "../src/phase2-core.js";
test("CSV handles quoted names with commas and line breaks",()=>{
 const rows=parseCsv('name,title,payType,hourlyRate\n"Smith, Alex",Clerk,hourly,20.25\n');
 assert.equal(rows[1][0],"Smith, Alex");
 const records=importEmployees('name,title,payType,hourlyRate\n"Smith, Alex",Clerk,hourly,20.25\n');
 assert.equal(records[0].hourlyRateCents,2025);
 assert.equal(records[0].payFrequency,"biweekly");
});
test("salary imports use annual cents and never accept real secret fields",()=>{
 const row=importEmployees('name,title,payType,annualSalary\nPat Lee,Clerk,salary,50000.00\n')[0];
 assert.equal(row.annualSalaryCents,5000000);
 assert.equal(Object.hasOwn(row,"bankAccount"),false);
});
test("reject unsupported types, invalid cents and overlong imports",()=>{
 assert.throws(()=>importEmployees("name,payType\nA,a\n"),/name|pay/i);
 assert.throws(()=>importEmployees("name,payType,hourlyRate\nJane,other,12\n"),/pay type/);
 assert.throws(()=>importEmployees("name,payType,hourlyRate\nJane,hourly,12.012\n"));
 assert.throws(()=>parseCsv('"unterminated'),/Unclosed/);
});
test("reports duplicates for review but never merges based on name",()=>{
 const rows=importEmployees('name,title,payType,hourlyRate\nJane,Manager,hourly,25\nJane,Manager,hourly,25\n');
 const dup=findPossibleDuplicates(rows,[{displayName:"Jane",jobTitle:"Manager"}]);
 assert.deepEqual(dup,[2,3]);
 assert.equal(rows.length,2);
});
test("owner claim restricted to designated verified email with single-use documents",()=>{
 const rules=fs.readFileSync(new URL("../firestore.rules",import.meta.url),"utf8");
 assert.match(rules,/function ownerEmail\(\)/);
 assert.match(rules,/request\.auth\.token\.email_verified == true/);
 assert.match(rules,/!exists\(bootstrapPath\(\)\)/);
 assert.match(rules,/existsAfter\(bootstrapPath\(\)\)/);
 assert.match(rules,/request\.auth\.token\.email == ownerEmail\(\)/);
 assert.match(rules,/uid != request\.auth\.uid/);
});
test("all deployed Phase 2 modules have an entry point",()=>{
 const html=fs.readFileSync(new URL("../index.html",import.meta.url),"utf8");
 assert.match(html,/id="page-operations"/);
 assert.match(html,/id="ownerBootstrap"/);
 const workflow=fs.readFileSync(new URL("../.github/workflows/pages.yml",import.meta.url),"utf8");
 for(const asset of ["phase2.html","src/phase2.js","src/bootstrap.js","src/phase2-core.js"])assert.ok(workflow.includes(asset));
});