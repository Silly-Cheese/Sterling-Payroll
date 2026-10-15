export const ROLES=Object.freeze(["client_admin","payroll_specialist","viewer"]);
export const FREQUENCIES=Object.freeze({weekly:52,biweekly:26,semimonthly:24,monthly:12});
export function assertMoney(value,label="amount"){
 if(!Number.isSafeInteger(value)||value<0||value>1_000_000_000)throw Error(label+" must be a nonnegative amount of cents");
 return value;
}
export function toCents(value){
 const text=String(value??"").trim();
 if(!/^\d{1,9}(?:\.\d{1,2})?$/.test(text))throw Error("Enter a valid dollar amount (at most 2 decimals)");
 const [whole,fraction=""]=text.split(".");
 return assertMoney(Number(whole)*100+Number(fraction.padEnd(2,"0")),"amount");
}
export const money=cents=>"$"+(Number(cents||0)/100).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
export function hoursValue(value){
 const num=Number(value);
 if(!Number.isFinite(num)||num<0||num>744||Math.round(num*100)!==num*100)throw Error("Hours must be 0–744, up to two decimal places");
 return num;
}
export function calculateLine({employee,regularHours=0,overtimeHours=0,bonusCents=0,deductionCents=0}){
 if(!employee||employee.status!=="active")throw Error("Only active employees can be included in a payroll run");
 const payType=employee.payType;
 const bonus=assertMoney(bonusCents,"bonus"),deduction=assertMoney(deductionCents,"deduction");
 let regularCents, overtimeCents=0,regular=0,overtime=0;
 if(payType==="hourly"){
  regular=hoursValue(regularHours);overtime=hoursValue(overtimeHours);
  const rate=assertMoney(employee.hourlyRateCents,"hourly rate");
  regularCents=Math.round(rate*regular);
  overtimeCents=Math.round(rate*1.5*overtime);
 }else if(payType==="salary"){
  const periods=FREQUENCIES[employee.payFrequency];
  if(!periods)throw Error("Unsupported salary pay frequency");
  regularCents=Math.round(assertMoney(employee.annualSalaryCents,"annual salary")/periods);
 }else throw Error("Unsupported pay type");
 const grossCents=regularCents+overtimeCents+bonus;
 if(deduction>grossCents)throw Error("Deductions cannot exceed gross simulated earnings");
 return {employeeId:employee.id||"",employeeName:employee.displayName||"Employee",payType,
  regularHours:regular,overtimeHours:overtime,
  regularCents,overtimeCents,bonusCents:bonus,deductionCents:deduction,grossCents,
  netCents:grossCents-deduction};
}
export function summarizeLines(lines){
 const totals={grossCents:0,netCents:0,bonusCents:0,deductionCents:0,employees:0};
 const seen=new Set();
 for(const line of lines){
  if(!line.employeeId||seen.has(line.employeeId))throw Error("Duplicate or missing employee in payroll preview");
  seen.add(line.employeeId);totals.employees++;
  for(const field of ["grossCents","netCents","bonusCents","deductionCents"]){
   totals[field]+=assertMoney(line[field],field);
  }
 }
 return totals;
}
export function canTransition(from,to,actor,run,role,platform=false){
 const privileged=platform||role==="client_admin";
 if(from==="draft"&&to==="submitted")return platform||role==="payroll_specialist"||privileged;
 if(from==="submitted"&&(to==="approved"||to==="rejected"))return privileged&&run.submittedBy!==actor;
 if(from==="approved"&&to==="finalized")return privileged&&run.approvedBy!==actor&&run.submittedBy!==actor;
 if(from==="rejected"&&to==="draft")return platform||role==="payroll_specialist"||privileged;
 return false;
}
export function validPeriod(start,end,payDate){
 return /^\d{4}-\d\d-\d\d$/.test(start)&&/^\d{4}-\d\d-\d\d$/.test(end)&&
 /^\d{4}-\d\d-\d\d$/.test(payDate)&&start<=end&&end<=payDate;
}
export function cleanEmail(value){return String(value||"").trim().toLowerCase()}
