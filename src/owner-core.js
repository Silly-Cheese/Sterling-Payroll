import {toCents,hoursValue} from "./payroll-core.js";
export function correctedLine(previous,input){
 if(!previous||!previous.employeeId)throw Error("Select a payroll line first");
 const regularCents=toCents(input.regular),overtimeCents=toCents(input.overtime);
 const bonusCents=toCents(input.bonus),deductionCents=toCents(input.deduction);
 const grossCents=regularCents+overtimeCents+bonusCents;
 if(grossCents>1000000000||deductionCents>grossCents)throw Error("Invalid revised fictional gross or deductions");
 return {...previous,regularCents,overtimeCents,bonusCents,deductionCents,grossCents,
  netCents:grossCents-deductionCents,
  regularHours:hoursValue(input.regularHours),overtimeHours:hoursValue(input.overtimeHours)};
}
export function correctedPeriod(previous,input){
 if(!previous||!previous.periodStart)throw Error("Choose a payroll period");
 const {periodStart,periodEnd,payDate,status}=input;
 const iso=/^\d{4}-\d{2}-\d{2}$/;
 if(![periodStart,periodEnd,payDate].every(v=>iso.test(v))||periodStart>periodEnd||periodEnd>payDate)throw Error("Period dates must be valid and ordered");
 if(!["draft","submitted","approved","finalized","rejected","voided"].includes(status))throw Error("Invalid payroll status");
 return {...previous,periodStart,periodEnd,payDate,status};
}
export function reason(value){
 const text=String(value||"").trim();
 if(text.length<10||text.length>500)throw Error("Provide an audit reason between 10 and 500 characters");
 return text;
}
export function canHardDelete(kind,hasChildren){
 if(["payrollRuns","tenants"].includes(kind))return !hasChildren;
 return ["employees","timeEntries","timeCorrections","leaveRequests","announcements","supportTickets","billingInvoices"].includes(kind);
}