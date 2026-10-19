// Pure selectors. All source data must be loaded completely before authoritative totals.
export const MODES={combined:"Timecards + commissions","timecards-only":"Timecards only","commissions-only":"Commissions only"};
export const CADENCES={weekly:7,biweekly:14,semimonthly:0,monthly:0};
const txt=v=>String(v??"").trim();
export function dateOnly(v){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(txt(v)))throw Error("Use a YYYY-MM-DD calendar date.");
 const d=new Date(v+"T12:00:00Z");
 if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==v)throw Error("Date is not valid.");
 return v;
}
export function dayAfter(day,amount=1){
 const d=new Date(dateOnly(day)+"T12:00:00Z");d.setUTCDate(d.getUTCDate()+amount);return d.toISOString().slice(0,10);
}
function monthBoundaries(day,semi=false){
 const [year,month,date]=dateOnly(day).split("-").map(Number);
 const prefix=year+"-"+String(month).padStart(2,"0")+"-";
 const start=prefix+(semi&&date>15?"16":"01");
 const last=new Date(Date.UTC(year,month,0)).getUTCDate();
 const end=prefix+(semi&&date<=15?"15":String(last).padStart(2,"0"));
 return {start,end};
}
export function schedulePeriods(schedule,count=5,existing=[]){
 if(!schedule||!Object.hasOwn(CADENCES,schedule.cadence))throw Error("Choose a schedule cadence.");
 if(!Object.hasOwn(MODES,schedule.mode))throw Error("Choose a payroll processing mode.");
 if(!Number.isInteger(count)||count<1||count>12)throw Error("Preview up to 12 periods.");
 const anchor=dateOnly(schedule.anchorDate);
 const delay=Number(schedule.paydayOffsetDays??0);
 if(!Number.isInteger(delay)||delay<0||delay>30)throw Error("Payday offset must be 0–30 days.");
 const periods=[];let cursor=anchor;
 for(let i=0;i<count;i++){
  let start,end;
  if(CADENCES[schedule.cadence]){
   start=cursor;end=dayAfter(start,CADENCES[schedule.cadence]-1);cursor=dayAfter(end);
  }else{
   const window=monthBoundaries(cursor,schedule.cadence==="semimonthly");
   start=window.start;end=window.end;cursor=dayAfter(end);
  }
  const overlaps=existing.filter(run=>run.status!=="voided"&&run.periodStart<=end&&run.periodEnd>=start);
  periods.push({start,end,payDate:dayAfter(end,delay),mode:schedule.mode,
   name:txt(schedule.namePrefix).slice(0,55)||"Scheduled payroll",
   overlappingRuns:overlaps.map(r=>r.id)});
 }
 return periods;
}
export function validateProfile(input,employee){
 if(!employee?.id)throw Error("Select an existing employee.");
 const effectiveDate=dateOnly(input.effectiveDate);
 const type=employee.payType;
 if(!["salary","hourly"].includes(type))throw Error("Employee pay type is not supported.");
 const dollars=v=>{
  if(!/^\d+(?:\.\d{1,2})?$/.test(txt(v)))throw Error("Enter a dollar amount with at most two decimals.");
  const n=Math.round(Number(v)*100);
  if(!Number.isSafeInteger(n)||n<0||n>1e9)throw Error("Dollar amount is outside the supported range.");
  return n;
 };
 const rate=dollars(input.payRate);
 const tax=Number(input.taxRatePercent);
 if(!Number.isFinite(tax)||tax<0||tax>100||Math.round(tax*100)!==tax*100)
  throw Error("Simulated tax percentage must be 0–100 with up to two decimals.");
 const fixed=dollars(input.recurringDeduction);
 return {effectiveDate,payType:type,
  ...(type==="hourly"?{hourlyRateCents:rate}:{annualSalaryCents:rate}),
  taxRateBasisPoints:Math.round(tax*100),recurringDeductionCents:fixed,
  note:txt(input.note).slice(0,160)};
}
export function currentCompensation(profile,date){
 if(!profile?.versions?.length)return null;
 const on=dateOnly(date);
 return profile.versions.filter(v=>v.effectiveDate<=on)
  .sort((a,b)=>b.effectiveDate.localeCompare(a.effectiveDate))[0]||null;
}
export function compensationChange(profile,version){
 const history=Array.isArray(profile?.versions)?profile.versions:[];
 if(history.some(v=>v.effectiveDate===version.effectiveDate))
  throw Error("A compensation version already exists for that effective date.");
 if(history.length>=20)throw Error("Maximum 20 versions reached. Archive older profiles before adding more.");
 return [...history,version].sort((a,b)=>a.effectiveDate.localeCompare(b.effectiveDate));
}
export function integrityReport({employees=[],timeEntries=[],runs=[],sales=[],profiles=[],completeness={}}={}){
 const issues=[],warnings=[],em=new Map(employees.map(e=>[e.id,e])),byDate=new Map();
 for(const t of timeEntries){
  if(!em.has(t.employeeId))issues.push({type:"missing-employee",record:t.id,detail:"Timecard references an unknown employee."});
  const key=t.employeeId+"|"+t.workDate;
  if(byDate.has(key))warnings.push({type:"duplicate-day",record:t.id,detail:"Multiple timecards exist for this employee and date."});
  byDate.set(key,t.id);
  if((Number(t.regularHours)||0)+(Number(t.overtimeHours)||0)>24)
   warnings.push({type:"long-workday",record:t.id,detail:"Recorded hours exceed 24 for this day."});
 }
 const unclaimed=new Map();
 for(const sale of sales){
  if(!em.has(sale.employeeId))issues.push({type:"orphan-sale",record:sale.id,detail:"Commission sale references an unknown employee."});
  if(sale.status==="approved"&&!sale.paidRunId)unclaimed.set(sale.employeeId,(unclaimed.get(sale.employeeId)||0)+1);
 }
 for(const [employeeId,count] of unclaimed)
  warnings.push({type:"unclaimed-commission",record:employeeId,detail:count+" approved sale(s) not linked to payroll."});
 const active=runs.filter(r=>r.status!=="voided");
 for(let i=0;i<active.length;i++)for(let j=i+1;j<active.length;j++){
  const a=active[i],b=active[j];
  if(a.periodStart<=b.periodEnd&&b.periodStart<=a.periodEnd&&(a.processingMode||"combined")===(b.processingMode||"combined")&&
   !a.correctionOf&&!b.correctionOf)warnings.push({type:"period-overlap",record:a.id,detail:"Overlaps another pay period of the same mode."});
 }
 for(const p of profiles)if(!em.has(p.id))warnings.push({type:"orphan-profile",record:p.id,detail:"Compensation profile references a missing employee."});
 const incomplete=Object.values(completeness).some(v=>v!==true);
 if(incomplete)warnings.unshift({type:"incomplete-coverage",record:"data",detail:"Some source collections did not load completely. Totals are provisional."});
 return {issues,warnings,complete:!incomplete,scanned:{employees:employees.length,timecards:timeEntries.length,
  runs:runs.length,sales:sales.length,profiles:profiles.length}};
}
export function approvalQueue({timeEntries=[],sales=[],runs=[],uid="",owner=false,mode="all"}={}){
 const all=[
  ...timeEntries.filter(x=>(x.status||"pending")==="pending").map(x=>({kind:"time",id:x.id,employeeId:x.employeeId,date:x.workDate,amountCents:0,eligible:owner||x.createdBy!==uid})),
  ...sales.filter(x=>x.status==="pending").map(x=>({kind:"commission",id:x.id,employeeId:x.employeeId,date:x.saleDate,amountCents:x.commissionCents||0,eligible:owner||x.createdBy!==uid})),
  ...runs.filter(x=>["submitted","approved","rejected"].includes(x.status)).map(x=>({kind:"run",id:x.id,employeeId:"",
   date:x.periodEnd,amountCents:0,status:x.status,eligible:owner||x.submittedBy!==uid}))
 ];
 return all.filter(x=>mode==="all"||x.kind===mode).sort((a,b)=>String(b.date).localeCompare(String(a.date)));
}
export function reconcileRun(run,lines,sales,employees,complete=true){
 const issues=[],known=new Set(employees.map(x=>x.id));
 let gross=0,net=0,commissions=0,taxes=0;
 for(const l of lines){
  const g=Number(l.grossCents||0),n=Number(l.netCents||0),c=Number(l.commissionCents||0),deductions=Number(l.deductionCents||0);
  if(!known.has(l.employeeId))issues.push("Pay line references missing employee: "+l.employeeId);
  if(g!==n+deductions)issues.push("Pay line does not reconcile: "+l.employeeName);
  if((run.processingMode||"combined")==="commissions-only"&&(l.regularCents||l.overtimeCents||l.bonusCents))
   issues.push("Unexpected wages in commission-only run: "+l.employeeName);
  if(run.processingMode==="timecards-only"&&c)issues.push("Unexpected commission in timecard-only run: "+l.employeeName);
  gross+=g;net+=n;commissions+=c;taxes+=Number(l.taxCents||0);
 }
 const included=sales.filter(x=>x.paidRunId===run.id);
 const claimed=included.reduce((t,x)=>t+(Number(x.commissionCents)||0),0);
 if(claimed!==commissions)issues.push("Commission totals do not match claimed sale records.");
 if(!complete)issues.push("Source data incomplete; reconciliation is not final.");
 return {issues,totals:{employees:lines.length,grossCents:gross,netCents:net,commissionCents:commissions,
  taxCents:taxes,claimedSales:included.length},complete:complete&&!issues.length};
}
export function reportingRows({employees=[],runs=[],sales=[],timeEntries=[]}={}){
 const index=new Map(employees.map(e=>[e.id,e.displayName]));
 return {
  employees:employees.map(e=>({name:e.displayName,department:e.department||"",status:e.status||"",type:e.payType||""})),
  periods:runs.map(r=>({name:r.name||r.periodStart+" – "+r.periodEnd,start:r.periodStart,end:r.periodEnd,
   mode:r.processingMode||"combined",status:r.status,payDate:r.payDate})),
  commissions:sales.map(s=>({employee:index.get(s.employeeId)||"Missing employee",date:s.saleDate,
   amount:(Number(s.saleAmountCents||0)/100).toFixed(2),commission:(Number(s.commissionCents||0)/100).toFixed(2),
   status:s.status,claimed:s.paidRunId?"Yes":"No"})),
  hours:timeEntries.map(t=>({employee:index.get(t.employeeId)||"Missing employee",date:t.workDate,
   regular:t.regularHours,overtime:t.overtimeHours,status:t.status||"pending"}))
 };
}
export function toCSV(rows){
 if(!Array.isArray(rows)||!rows.length)return "";
 const columns=Object.keys(rows[0]),quote=v=>'"'+String(v??"").replace(/"/g,'""')+'"';
 return [columns,...rows.map(row=>columns.map(k=>row[k]))].map(row=>row.map(quote).join(",")).join("\r\n");
}
