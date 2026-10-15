const ISO=/^\d{4}-\d{2}-\d{2}$/;
export const RETENTION_DAYS=[90,180,365,730,1825,3650];
export function retentionPolicy(days,hold){
 const period=Number(days);
 if(!RETENTION_DAYS.includes(period)||typeof hold!=="boolean")throw Error("Invalid retention preference");
 return {reviewAfterDays:period,legalHold:hold};
}
export function assessIntegrity({employees=[],timeEntries=[],runs=[],invoices=[],tickets=[],linesByRun={},partial={}}){
 const issues=[],warnings=[],ids=new Set(employees.map(e=>e.id));
 for(const e of employees){
  if(!e.id||!e.displayName)issues.push("An employee profile is missing its identifier or display name.");
  if(!["active","leave","inactive"].includes(e.status))warnings.push("Employee "+(e.displayName||"unknown")+" has a nonstandard status.");
 }
 for(const t of timeEntries){
  if(!ids.has(t.employeeId))issues.push("Time entry "+(t.id||"unknown")+" refers to an employee not in the inspected data.");
  if(!Number.isFinite(t.regularHours)||!Number.isFinite(t.overtimeHours)||t.regularHours<0||t.overtimeHours<0)issues.push("Time entry "+(t.id||"unknown")+" has invalid hours.");
  if(!ISO.test(t.workDate||""))warnings.push("Time entry "+(t.id||"unknown")+" is missing a valid work date.");
 }
 for(const r of runs){
  if(!ISO.test(r.periodStart||"")||!ISO.test(r.periodEnd||"")||r.periodStart>r.periodEnd)issues.push("Payroll period "+(r.id||"unknown")+" has invalid dates.");
  if(r.status==="finalized"&&!r.finalizedBy)warnings.push("Finalized payroll period "+(r.id||"unknown")+" has no named finalizer.");
  if(r.status==="approved"&&r.approvedBy&&r.approvedBy===r.submittedBy)issues.push("Payroll approval and submission came from the same account.");
  const lines=linesByRun[r.id];if(!lines)continue;
  for(const line of lines){
   const a=["regularCents","overtimeCents","bonusCents","deductionCents","grossCents","netCents"].map(k=>line[k]);
   const commission=line.commissionCents||0;
   if(!a.every(v=>Number.isSafeInteger(v)&&v>=0)||!Number.isSafeInteger(commission)||commission<0||a[0]+a[1]+a[2]+commission!==a[4]||a[4]-a[3]!==a[5])issues.push("Pay line in period "+r.id+" does not reconcile.");
  }
 }
 for(const invoice of invoices)if(!Number.isSafeInteger(invoice.amountCents)||invoice.amountCents<0)issues.push("A fictional invoice has invalid amount data.");
 for(const ticket of tickets)if(!ticket.subject)warnings.push("A support case has no subject.");
 const capped=Object.entries(partial).filter(([,v])=>v).map(([k])=>k);
 if(capped.length)warnings.push("Integrity coverage is partial: "+capped.join(", ")+". Load/export additional pages to audit all records.");
 return {issues:[...new Set(issues)],warnings:[...new Set(warnings)],scanned:{employees:employees.length,timeEntries:timeEntries.length,runs:runs.length,invoices:invoices.length,tickets:tickets.length},complete:capped.length===0};
}
const EXPORT_FIELDS={
 employees:["id","displayName","jobTitle","department","payType","payFrequency","hourlyRateCents","annualSalaryCents","status","createdAt","updatedAt"],
 timeEntries:["id","employeeId","workDate","regularHours","overtimeHours","status","note","createdAt"],
 payrollRuns:["id","periodStart","periodEnd","payDate","status","createdAt","createdBy","submittedBy","approvedBy","finalizedBy","correctionOf","correctionReason"],
 billingInvoices:["id","description","amountCents","dueDate","status","createdAt","updatedAt"],
 supportTickets:["id","subject","details","status","priority","category","assignedUid","createdAt","updatedAt"],
 auditEvents:["id","category","action","subject","detail","actor","at"]
};
export const EXPORT_COLLECTIONS=Object.keys(EXPORT_FIELDS);
export function sanitizeRows(kind,records){
 const fields=EXPORT_FIELDS[kind];if(!fields)throw Error("Unsupported export collection");
 return records.map(record=>Object.fromEntries(fields.filter(field=>Object.hasOwn(record,field)).map(field=>[field,record[field]])));
}
export function exportPackage({client,collections,partial,createdAt=new Date().toISOString()}){
 const sanitized={};
 for(const kind of EXPORT_COLLECTIONS)sanitized[kind]=sanitizeRows(kind,collections[kind]||[]);
 return {notice:"STERLING PAYROLL — SIMULATED DATA ONLY — NOT AN OFFICIAL PAYROLL RECORD OR RESTORABLE DATABASE BACKUP",formatVersion:1,createdAt,client:{id:client.id,name:client.name,servicePlan:client.servicePlan||"starter"},partial:partial||{},data:sanitized};
}
export function reportMetrics({employees=[],runs=[],invoices=[],tickets=[]}){
 const active=employees.filter(e=>e.status==="active").length,finalized=runs.filter(r=>r.status==="finalized").length;
 const opened=tickets.filter(t=>!["resolved","closed"].includes(t.status)).length;
 const receivables=invoices.filter(i=>i.status==="issued").reduce((a,i)=>a+Number(i.amountCents||0),0);
 return {activeEmployees:active,finalizedPeriods:finalized,openCases:opened,fictionalReceivablesCents:receivables};
}