import test from "node:test";
import assert from "node:assert/strict";
import {filterTimecards,sumTimecardHours,payPeriodForSelection,formatHours} from "../src/timekeeping-core.js";
const names=new Map([["a","Abigail West"],["b","Zachary Reed"]]);
const entries=[
 {id:"1",employeeId:"a",workDate:"2026-10-12",regularHours:8,overtimeHours:0,status:"approved"},
 {id:"2",employeeId:"b",workDate:"2026-10-13",regularHours:6.5,overtimeHours:1.5,status:"pending"},
 {id:"3",employeeId:"a",workDate:"2026-10-13",regularHours:7.75,overtimeHours:2.25,status:"pending"},
 {id:"4",employeeId:"a",workDate:"2026-10-14",regularHours:4,overtimeHours:0,status:"rejected"},
 {id:"5",employeeId:"a",workDate:"2026-10-19",regularHours:9,overtimeHours:0,status:"approved"}
];
test("period totals use selected employee and exclude rejected and outside-period time",()=>{
 const period=filterTimecards(entries,{employeeId:"a",start:"2026-10-12",end:"2026-10-17"},names);
 const totals=sumTimecardHours(period);
 assert.equal(totals.total,18);
 assert.equal(totals.regular,15.75);
 assert.equal(totals.overtime,2.25);
 assert.equal(totals.approved,8);
 assert.equal(totals.pending,10);
 assert.equal(totals.rejected,4);
 assert.equal(totals.approvedCount,1);
 assert.equal(totals.pendingCount,1);
 assert.equal(totals.rejectedCount,1);
});
test("date and employee sorting is deterministic",()=>{
 assert.deepEqual(filterTimecards(entries,{sort:"date-asc"},names).map(x=>x.id),["1","3","2","4","5"]);
 assert.deepEqual(filterTimecards(entries,{sort:"date-desc"},names).map(x=>x.id),["5","4","2","3","1"]);
 assert.deepEqual(filterTimecards(entries,{sort:"employee-asc"},names).map(x=>x.id),["5","4","3","1","2"]);
 assert.deepEqual(filterTimecards(entries,{sort:"employee-desc"},names).map(x=>x.id),["2","5","4","3","1"]);
});
test("day status employee and text filters can be combined",()=>{
 assert.deepEqual(filterTimecards(entries,{day:"2026-10-13",status:"pending",employeeId:"b"},names).map(x=>x.id),["2"]);
 assert.deepEqual(filterTimecards(entries,{search:"abigail"},names).map(x=>x.id),["5","4","3","1"]);
});
test("pay periods map to the run boundaries without inferring a weekly window",()=>{
 const runs=[{id:"run1",periodStart:"2026-10-12",periodEnd:"2026-10-17"}];
 assert.deepEqual(payPeriodForSelection(runs,"run1"),{start:"2026-10-12",end:"2026-10-17",label:"2026-10-12 – 2026-10-17"});
 assert.deepEqual(payPeriodForSelection(runs,"all"),{start:"",end:"",label:"All dates"});
 assert.equal(payPeriodForSelection(runs,"invalid"),null);
 assert.equal(formatHours(18.5),"18.5");
});
