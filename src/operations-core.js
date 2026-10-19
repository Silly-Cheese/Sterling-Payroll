// Sterling Payroll 3.0 — deterministic, side-effect-free operational calculations.
// Everything is simulation-only. Date calculations use calendar days in UTC to
// avoid local-time DST shifts on YYYY-MM-DD values.
export const VALID_CADENCES=["weekly","biweekly","semimonthly","monthly"];
export const VALID_MODES=["combined","timecards-only","commissions-only"];
export const validDate=x=>typeof x==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&
 Number.isFinite(Date.parse(x+"T00:00:00Z"))&&new Date(x+"T00:00:00Z").toISOString().slice(0,10)===x;
export function toDay(x){if(!validDate(x))throw Error("Use a real calendar date (YYYY-MM-DD).");return new Date(x+"T00:00:00Z")}
export const iso=x=>x.toISOString().slice(0,10);
export const plusDays=(x,n)=>{let d=toDay(x);d.setUTCDate(d.getUTCDate()+n);return iso(d)};
export const plusMonths=(x,n)=>{let d=toDay(x),day=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+n);let y=d.getUTCFullYear(),m=d.getUTCMonth();return iso(new Date(Date.UTC(y,m,Math.min(day,new Date(Date.UTC(y,m+1,0)).getUTCDate()))))};
export function validatePaySchedule(input){
 const cadence=String(input.cadence||"");
 if(!VALID_CADENCES.includes(cadence))throw Error("Choose a supported pay cadence.");
 const processingMode=String(input.processingMode||"combined");
 if(!VALID_MODES.includes(processingMode))throw Error("Choose a supported payroll source mode.");
 const start=String(input.nextStart||""),payDelay=Number(input.payDelay);
 toDay(start);
 if(!Number.isInteger(payDelay)||payDelay<0||payDelay>30)throw Error("Payday offset must be 0–30 days.");
 const name=String(input.name||"").trim();
 if(name.length<2||name.length>80)throw Error("Enter a schedule name of 2–80 characters.");
 return {name,cadence,processingMode,nextStart:start,payDelay,active:input.active!==false};
}
export function schedulePeriods(input,count=3){
 const s=validatePaySchedule(input);
 if(!Number.isInteger(count)||count<1||count>12)throw Error("Preview 1–12 periods.");
 const out=[];let start=s.nextStart;
 for(let i=0;i<count;i++){
  let end,next;
  if(s.cadence==="weekly"||s.cadence==="biweekly"){
   next=plusDays(start,s.cadence==="weekly"?7:14);end=plusDays(next,-1);
  }else if(s.cadence==="monthly"){
   next=plusMonths(start,1);end=plusDays(next,-1);
  }else{
   const d=toDay(start),y=d.getUTCFullYear(),m=d.getUTCMonth();
   const firstHalf=d.getUTCDate()<=15;
   end=firstHalf?iso(new Date(Date.UTC(y,m,15))):iso(new Date(Date.UTC(y,m+1,0)));
   next=plusDays(end,1);
  }
  out.push({name:s.name,processingMode:s.processingMode,
   periodStart:start,periodEnd:end,payDate:plusDays(end,s.payDelay),index:i+1});
  start=next;
 }
 return out;
}
export const rangesOverlap=(a,b)=>a.periodStart<=b.periodEnd&&b.periodStart<=a.periodEnd;
export function validatePeriodAgainstRuns(proposed,runs=[]){
 if(!validDate(proposed.periodStart)||!validDate(proposed.periodEnd)||!validDate(proposed.payDate))
  throw Error("Period has an invalid date.");
 if(proposed.periodStart>proposed.periodEnd||proposed.payDate<proposed.periodEnd)
  throw Error("Period or pay date is inconsistent.");
 return runs.filter(run=>run.status!=="voided"&&rangesOverlap(proposed,run))
  .map(run=>({id:run.id,periodStart:run.periodStart,periodEnd:run.periodEnd,status:run.status}));
}
export function validateCompensationProfile(input){
 const employeeId=String(input.employeeId||"");
 if(!employeeId||employeeId.includes("/")||employeeId.length>128)throw Error("Choose an employee.");
 toDay(input.effectiveFrom);
 const taxRateBasisPoints=Number(input.taxRateBasisPoints);
 const recurringDeductionCents=Number(input.recurringDeductionCents);
 if(!Number.isInteger(taxRateBasisPoints)||taxRateBasisPoints<0||taxRateBasisPoints>10000)throw Error("Tax rate must be from 0 to 100%.");
 if(!Number.isSafeInteger(recurringDeductionCents)||recurringDeductionCents<0||recurringDeductionCents>1_000_000_000)throw Error("Invalid other deduction.");
 return {employeeId,effectiveFrom:input.effectiveFrom,taxRateBasisPoints,recurringDeductionCents};
}
export function profileApplies(profile,periodEnd){
 return Boolean(profile&&validDate(profile.effectiveFrom)&&profile.effectiveFrom<=periodEnd);
}
export function reconcileRun({run,lines=[],time=[],sales=[],employees=[],complete=false}){
 const findings=[];
 if(!run)return [{severity:"info",code:"NO_RUN",message:"Select a run for reconciliation."}];
 if(!complete)findings.push({severity:"warning",code:"PARTIAL",message:"Some source records may not be loaded; counts are provisional."});
 const mode=run.processingMode||"combined";
 const personIds=new Set(employees.map(x=>x.id));
 const lineIds=new Set(lines.map(x=>x.employeeId));
 let gross=0,net=0,comm=0,tax=0;
 for(const line of lines){
  if(!personIds.has(line.employeeId))findings.push({severity:"warning",code:"EMPLOYEE_MISSING",message:"Employee record unavailable for "+line.employeeId});
  if(mode==="commissions-only"&&(line.regularCents||line.overtimeCents||line.bonusCents||line.regularHours||line.overtimeHours||line.paidLeaveHours))
   findings.push({severity:"error",code:"MODE_WAGES",message:"Noncommission wages found for "+(line.employeeName||line.employeeId)});
  if(mode==="timecards-only"&&line.commissionCents)
   findings.push({severity:"error",code:"MODE_COMMISSION",message:"Commission earnings found in timecard-only run."});
  if(line.grossCents-line.deductionCents!==line.netCents)
   findings.push({severity:"error",code:"NET_MISMATCH",message:"Gross-to-net mismatch: "+(line.employeeName||line.employeeId)});
  if((line.taxCents||0)+(line.otherDeductionCents??(line.deductionCents-(line.taxCents||0)))!==line.deductionCents)
   findings.push({severity:"error",code:"TAX_MISMATCH",message:"Tax deduction mismatch: "+(line.employeeName||line.employeeId)});
  gross+=line.grossCents||0;net+=line.netCents||0;comm+=line.commissionCents||0;tax+=line.taxCents||0;
 }
 const eligibleSales=sales.filter(x=>x.status==="approved"&&x.saleDate>=run.periodStart&&x.saleDate<=run.periodEnd);
 if(mode!=="timecards-only"){
  const unmatched=eligibleSales.filter(x=>!x.paidRunId&&(!lineIds.has(x.employeeId)));
  if(unmatched.length)findings.push({severity:"warning",code:"UNASSIGNED_SALES",message:unmatched.length+" approved sales lack employee pay lines."});
 }
 if(mode!=="commissions-only"){
  const unapproved=time.filter(x=>x.workDate>=run.periodStart&&x.workDate<=run.periodEnd&&(x.status||"pending")==="pending");
  if(unapproved.length)findings.push({severity:"warning",code:"PENDING_TIME",message:unapproved.length+" timecards remain pending in this period."});
 }
 return {findings,totals:{employees:lineIds.size,grossCents:gross,netCents:net,commissionCents:comm,taxCents:tax},eligibleSales:eligibleSales.length};
}
export function payrollReadiness({run,lines=[],time=[],sales=[],employees=[],complete=false}){
 const result=reconcileRun({run,lines,time,sales,employees,complete});
 if(Array.isArray(result))return {ready:false,issues:result};
 const issues=[...result.findings];
 if(!complete)issues.push({severity:"error",code:"FULL_LOAD",message:"Load complete source records before authorizing payroll."});
 if(!run)issues.push({severity:"error",code:"NO_RUN",message:"Select a payroll run."});
 if(!lines.length)issues.push({severity:"error",code:"NO_LINES",message:"No calculated pay lines exist."});
 return {ready:!issues.some(x=>x.severity==="error"),issues,totals:result.totals};
}
export function groupedPayrollReport(runs=[],linesByRun={}){
 const result=[];
 for(const run of runs){
  const lines=linesByRun[run.id]||[];
  const totals=lines.reduce((a,l)=>{a.gross+=l.grossCents||0;a.net+=l.netCents||0;a.tax+=l.taxCents||0;a.commissions+=l.commissionCents||0;return a},{gross:0,net:0,tax:0,commissions:0});
  result.push({name:run.name||run.periodStart+" – "+run.periodEnd,periodStart:run.periodStart,periodEnd:run.periodEnd,
   status:run.status,mode:run.processingMode||"combined",employees:lines.length,...totals});
 }
 return result;
}
export function CSV(rows){
 const quote=x=>'"'+String(x??"").replace(/"/g,'""')+'"';
 return rows.map(row=>row.map(quote).join(",")).join("\r\n")+"\r\n";
}
