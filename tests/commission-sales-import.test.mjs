import test from "node:test";
import assert from "node:assert/strict";
import {parseSalesCsv,prepareSalesImport,filterSales,saleSummary,normalizeSaleDate} from "../src/commission-sales-import.js";
const employees=[{id:"abc",displayName:"Jim Joe",status:"active"},{id:"def",displayName:"Ana Smith",status:"active"}];
const plans=new Map([["abc",{type:"percent",rateBasisPoints:2500,fixedCents:0,active:true}],["def",{type:"fixed",fixedCents:1000,rateBasisPoints:0,active:true}]]);
test("parse quotes, embedded commas, CRLF and headers with common aliases",()=>{
 const rows=parseSalesCsv('Employee Name,Date,Amount Sold,Description,Reference\r\n"Jim Joe",10/12/2026,"$2,400.50","Custom, deluxe product",A-25\r\n');
 assert.equal(rows.length,1);
 const prepared=prepareSalesImport(rows,employees,plans);
 assert.equal(prepared.valid.length,1);assert.equal(prepared.valid[0].saleAmountCents,240050);
 assert.equal(prepared.valid[0].commissionCents,60013);
 assert.equal(prepared.valid[0].saleDate,"2026-10-12");assert.equal(prepared.valid[0].description,"Custom, deluxe product");
});
test("reject invalid names, unknown plans, impossible dates and malformed records with per-row errors",()=>{
 const rows=parseSalesCsv('employeeName,saleDate,saleAmount,description\nNobody,2026-10-12,100,Book\nJim Joe,2026-02-31,100,Book\nAna Smith,2026-10-15,75.00,Widgets\n');
 const result=prepareSalesImport(rows,employees,plans);
 assert.equal(result.errors.length,2);assert.equal(result.valid.length,1);assert.equal(result.valid[0].commissionCents,1000);
});
test("stable sale IDs avoid reimporting the same CSV while allowing repeated distinct sales",()=>{
 const csv='employeeName,saleDate,saleAmount,description\nJim Joe,2026-10-12,100,Book\nJim Joe,2026-10-12,100,Book\n';
 const a=prepareSalesImport(parseSalesCsv(csv),employees,plans).valid;
 const b=prepareSalesImport(parseSalesCsv(csv),employees,plans).valid;
 assert.equal(a.length,2);assert.notEqual(a[0].id,a[1].id);assert.deepEqual(a.map(x=>x.id),b.map(x=>x.id));
});
test("date sorting, employee sorting, amount sorting and metrics",()=>{
 const sales=[
  {id:"a",employeeId:"abc",saleDate:"2026-10-16",saleAmountCents:5000,commissionCents:1250,status:"pending",description:"One"},
  {id:"b",employeeId:"def",saleDate:"2026-10-12",saleAmountCents:10000,commissionCents:1000,status:"approved",description:"Two"}
 ];
 const name=id=>employees.find(e=>e.id===id)?.displayName||"";
 assert.deepEqual(filterSales(sales,{sort:"amount-desc"},name).map(x=>x.id),["b","a"]);
 assert.deepEqual(filterSales(sales,{sort:"employee-asc"},name).map(x=>x.id),["b","a"]);
 assert.deepEqual(filterSales(sales,{start:"2026-10-15"},name).map(x=>x.id),["a"]);
 assert.equal(saleSummary(sales).approvedCents,1000);
});
test("CSV row limits, ambiguous employees and date validation are enforced",()=>{
 assert.throws(()=>parseSalesCsv("name,amount\nJim,10"),/missing CSV column/i);
 const duplicates=[...employees,{id:"ghi",displayName:" jim  joe ",status:"active"}];
 const row=parseSalesCsv('employeeName,saleDate,saleAmount,description\nJim Joe,2026-10-12,100,Book');
 assert.match(prepareSalesImport(row,duplicates,plans).errors[0].message,/multiple employees/i);
 assert.throws(()=>normalizeSaleDate("2026-02-30"),/invalid calendar/i);
});
