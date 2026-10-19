import {calculateLine,assertMoney,hoursValue,summarizeLines} from "./payroll-core.js";
import {applySimulatedTaxes} from "./payroll-tax-core.js?v=sterling-sim-tax-20261018";
import {payrollRunModeLabel} from "./payroll-run-modes.js?v=sterling-payroll-modes-20261019";
import {currentCompensation} from "./payroll-next-core.js?v=sterling-next-20261018";
export const DEFAULT_POLICY=Object.freeze({version:1,overtimeMultiplierHundredths:150,defaultBonusCents:0,defaultDeductionCents:0,defaultTaxRateBasisPoints:0,requireApprovedTime:true});
export function validatePolicy(input){
 const version=Number(input.version||1);
 const multiplier=Number(input.overtimeMultiplierHundredths);
 if(!Number.isSafeInteger(version)||version<1||version>999999)throw Error("Policy version out of range");
 if(!Number.isInteger(multiplier)||multiplier<100||multiplier>300)throw Error("Overtime multiplier must be 1.00–3.00");
 const bonus=assertMoney(input.defaultBonusCents,"default bonus"),deduction=assertMoney(input.defaultDeductionCents,"default deduction");
 const rate=input.defaultTaxRateBasisPoints??0;
 if(!Number.isInteger(rate)||rate<0||rate>10000)throw Error("Simulated tax rate must be 0–100% (up to two decimals).");
 if(input.requireApprovedTime!==true)throw Error("Time approval is mandatory for Phase 3");
 return {version,overtimeMultiplierHundredths:multiplier,defaultBonusCents:bonus,defaultDeductionCents:deduction,defaultTaxRateBasisPoints:rate,requireApprovedTime:true};
}
export function validReviewTransition(record,reviewer,next){
 return Boolean(record&&record.status==="pending"&&["approved","rejected"].includes(next)&&
   reviewer&&record.createdBy!==reviewer);
}
export function buildPayrollPreview({employees,entries,corrections=[],leaveRequests=[],compensationChanges=[],policy=DEFAULT_POLICY,start,end}){
 const config=validatePolicy(policy),issues=[],lines=[],sources=[];
 if(!/^\d{4}-\d\d-\d\d$/.test(start)||!/^\d{4}-\d\d-\d\d$/.test(end)||end<start)throw Error("Invalid payroll period");
 const byOriginal=new Map();
 for(const correction of corrections){
  if(correction.status!=="approved")continue;
  if(!byOriginal.has(correction.timeEntryId))byOriginal.set(correction.timeEntryId,[]);
  byOriginal.get(correction.timeEntryId).push(correction);
 }
 const approvedLeave=leaveRequests.filter(x=>x.status==="approved"&&x.date>=start&&x.date<=end);
 const relevant=entries.filter(x=>x.workDate>=start&&x.workDate<=end);
 const approvedEntries=[];
 for(const entry of relevant){
  const employee=employees.find(e=>e.id===entry.employeeId);
  if(!employee||employee.status!=="active")continue;
  if(entry.status!=="approved"){issues.push({kind:"unapproved-time",detail:entry.id});continue}
  const correction=byOriginal.get(entry.id)||[];
  if(correction.length>1){issues.push({kind:"conflicting-corrections",detail:entry.id});continue}
  const actual=correction.length?correction[0]:entry;
  approvedEntries.push({...entry,regularHours:actual.regularHours,overtimeHours:actual.overtimeHours});
  sources.push(entry.id+(correction.length?":"+correction[0].id:""));
 }
 for(const leave of approvedLeave){
  if(!employees.some(e=>e.id===leave.employeeId&&e.status==="active"))continue;
  sources.push("leave:"+leave.id);
 }
 // A run with incomplete/ambiguous approved time must not generate pay lines.
 if(issues.length)return {lines:[],issues,sources,totals:null};
 for(const employee of employees.filter(e=>e.status==="active")){
  const applicable=currentCompensation({versions:compensationChanges.filter(x=>x.employeeId===employee.id)},end);
  const effectiveEmployee=applicable?{...employee,...(applicable.payType==="hourly"?
   {hourlyRateCents:applicable.hourlyRateCents}:{annualSalaryCents:applicable.annualSalaryCents})}:employee;
  const deduction=applicable?.recurringDeductionCents??config.defaultDeductionCents;
  const work=approvedEntries.filter(x=>x.employeeId===employee.id);
  const leave=approvedLeave.filter(x=>x.employeeId===employee.id);
  const paidLeaveHours=Math.round(leave.reduce((sum,x)=>sum+hoursValue(x.hours),0)*100)/100;
  const regularHours=Math.round((work.reduce((sum,x)=>sum+hoursValue(x.regularHours),0)+paidLeaveHours)*100)/100;
  const overtimeHours=Math.round(work.reduce((sum,x)=>sum+hoursValue(x.overtimeHours),0)*100)/100;
  if(employee.payType==="hourly"&&regularHours+overtimeHours===0)continue;
  const base=calculateLine({employee:effectiveEmployee,regularHours,overtimeHours,
    bonusCents:config.defaultBonusCents,deductionCents:deduction});
  // Overtime multiplier is a fictional policy; no claim of jurisdiction-specific law.
  if(employee.payType==="hourly"){
   base.overtimeCents=Math.round(effectiveEmployee.hourlyRateCents*config.overtimeMultiplierHundredths/100*overtimeHours);
   base.grossCents=base.regularCents+base.overtimeCents+base.bonusCents;
   if(base.deductionCents>base.grossCents){issues.push({kind:"deductions-exceed-gross",detail:employee.id});continue}
   base.netCents=base.grossCents-base.deductionCents;
  }
  base.paidLeaveHours=paidLeaveHours;
  base.policyVersion=config.version;
  // The final tax calculation runs once again after commissions are attached.
  base.taxRateBasisPoints=applicable?.taxRateBasisPoints??config.defaultTaxRateBasisPoints;
  base.taxCents=0;
  base.otherDeductionCents=base.deductionCents;
  lines.push(base);
 }
 if(issues.length)return {lines:[],issues,sources,totals:null};
 try{
  const taxed=applySimulatedTaxes(lines,config.defaultTaxRateBasisPoints);
  return {lines:taxed,issues,sources,totals:summarizeLines(taxed)};
 }catch(error){
  issues.push({kind:"tax-deduction-error",detail:error.message});
  return {lines:[],issues,sources,totals:null};
 }
}
export function validateCorrection(form){
 const regularHours=hoursValue(form.regularHours),overtimeHours=hoursValue(form.overtimeHours);
 const reason=String(form.reason||"").trim();
 if(reason.length<6||reason.length>300)throw Error("A correction reason between 6 and 300 characters is required");
 return {regularHours,overtimeHours,reason};
}
export function validateLeave(form){
 const hours=hoursValue(form.hours),reason=String(form.reason||"").trim();
 if(hours<=0||hours>24)throw Error("Leave hours must be 0.01–24");
 if(!/^\d{4}-\d\d-\d\d$/.test(form.date))throw Error("Enter a valid leave date");
 if(reason.length<5||reason.length>250)throw Error("A leave reason between 5 and 250 characters is required");
 return {date:form.date,hours,reason};
}
export function csvStatement({company,run,lines}){
 const quote=v=>'"'+String(v??"").replaceAll('"','""')+'"';
 const rows=[["Sterling Payroll — SIMULATED PAY ONLY"],["Company",company],["Run name",run.name||run.periodStart+" — "+run.periodEnd],["Processing mode",payrollRunModeLabel(run.processingMode)],["Period",run.periodStart+" through "+run.periodEnd],["Simulated pay date",run.payDate],
  ["Employee","Regular","Overtime","Bonus","Commission","Simulated taxes","Tax rate (%)","Other deductions","Total deductions","Gross","Net"],
  ...lines.map(l=>[l.employeeName,(l.regularCents/100).toFixed(2),(l.overtimeCents/100).toFixed(2),(l.bonusCents/100).toFixed(2),((l.commissionCents||0)/100).toFixed(2),((l.taxCents||0)/100).toFixed(2),((l.taxRateBasisPoints||0)/100).toFixed(2),((l.otherDeductionCents??((l.deductionCents||0)-(l.taxCents||0)))/100).toFixed(2),((l.deductionCents||0)/100).toFixed(2),(l.grossCents/100).toFixed(2),(l.netCents/100).toFixed(2)])];
 return rows.map(r=>r.map(quote).join(",")).join("\r\n");
}