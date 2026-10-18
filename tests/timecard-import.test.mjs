import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {parseTimecardCsv,matchTimecards,validWorkDate,groupTimecards,timecardCsvTemplate,importDocumentId} from "../src/timecard-import-core.js";
const employees=[
 {id:"e1",displayName:"Alex Morgan",department:"Sales",status:"active"},
 {id:"e2",displayName:"Alex Morgan",department:"Finance",status:"active"},
 {id:"e3",displayName:"Jordan Lee",department:"Operations",status:"active"},
 {id:"e4",displayName:"Inactive Person",department:"Sales",status:"inactive"}
];
test("Name-first CSV template requires no employee IDs",()=>{
 assert.match(timecardCsvTemplate,/^employeeName,department,workDate,regularHours,overtimeHours,note/);
 assert.doesNotMatch(timecardCsvTemplate.split("\n")[0],/employeeId/);
 const rows=parseTimecardCsv("employeeName,workDate,regularHours,overtimeHours\nJordan Lee,2026-10-15,8,2\n");
 assert.equal(rows.length,1);
 assert.equal(rows[0].employeeId,"");
 assert.equal(rows[0].employeeName,"Jordan Lee");
 assert.equal(matchTimecards(rows,employees)[0].employee.id,"e3");
});
test("Name matching is case-insensitive and trims whitespace",()=>{
 const rows=parseTimecardCsv("Name,Date,Regular,OT\n  jOrDaN   LeE  ,10/15/2026,6,2\n");
 const match=matchTimecards(rows,employees);
 assert.equal(match[0].status,"ready");
 assert.equal(match[0].employee.id,"e3");
 assert.equal(match[0].workDate,"2026-10-15");
});
test("Duplicate names ask for department, not an ID",()=>{
 const ambiguous=matchTimecards(parseTimecardCsv("employeeName,workDate,regularHours,overtimeHours\nAlex Morgan,2026-10-15,8,0\n"),employees);
 assert.equal(ambiguous[0].status,"ambiguous");
 assert.match(ambiguous[0].error,/department/);
 const unique=matchTimecards(parseTimecardCsv("employeeName,department,workDate,regularHours,overtimeHours\nAlex Morgan,finance,2026-10-15,8,0\n"),employees);
 assert.equal(unique[0].status,"ready");
 assert.equal(unique[0].employee.id,"e2");
});
test("Matches handle invalid dates, duplicate entries and inactive staff",()=>{
 assert.throws(()=>validWorkDate("2026-02-30"),/Invalid calendar date/);
 const rows=parseTimecardCsv("employeeName,date,regular,ot\nJordan Lee,2026-10-15,8,0\nJordan Lee,2026-10-15,4,0\nInactive Person,2026-10-15,4,0\nUnknown Name,2026-10-15,4,0\n");
 const resolved=matchTimecards(rows,employees);
 assert.deepEqual(resolved.map(x=>x.status),["ready","duplicate","inactive","unmatched"]);
 const old=matchTimecards(rows.slice(0,1),employees,[{employeeId:"e3",workDate:"2026-10-15"}]);
 assert.equal(old[0].status,"duplicate");
});
test("Timecard import rejects invalid hours and oversized files",()=>{
 const records=parseTimecardCsv("employeeName,date,regular,ot\nJordan Lee,2026-10-15,25,0\nJordan Lee,2026-10-16,8.555,0\nJordan Lee,2026-10-17,8,17\n");
 assert.deepEqual(records.map(x=>Boolean(x.error)),[true,true,true]);
 assert.throws(()=>parseTimecardCsv("employeeName,date,regular,ot\n"),/at least one/);
 assert.throws(()=>parseTimecardCsv("x".repeat(160001)),/too large/);
});
test("Imported documents have stable private IDs and are safely grouped",()=>{
 assert.equal(importDocumentId("e3","2026-10-15"),"timecard_e3_2026-10-15");
 const dates=["2026-10-15","2026-10-16","2026-10-17"];
 const rows=dates.map(workDate=>({employee:employees[2],workDate}));
 assert.equal(groupTimecards(rows).length,1);
 const more=Array.from({length:100},(_,i)=>({employee:employees[2],workDate:"2026-10-15"}));
 assert.equal(groupTimecards(more).length,2);
});
test("Timekeeping deploy includes importer source and no separate account authorization",()=>{
 const app=fs.readFileSync(new URL("../src/app.js",import.meta.url),"utf8");
 const workflow=fs.readFileSync(new URL("../.github/workflows/pages.yml",import.meta.url),"utf8");
 assert.match(app,/mountTimecardImport/);
 assert.match(app,/timecardUI\.sync\(\)/);
 assert.match(workflow,/src\/timecard-import-core\.js/);
 assert.match(workflow,/src\/timecard-import\.js/);
});
