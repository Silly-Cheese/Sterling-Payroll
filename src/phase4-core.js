export function validatePreferences({preferredName,notifications}){
 const name=String(preferredName??"").trim();
 if(name.length>80)throw Error("Preferred name cannot exceed 80 characters");
 if(typeof notifications!=="boolean")throw Error("Notification preference must be true or false");
 return {preferredName:name,notifications};
}
export function sanitizeStatementLine(line){
 const fields=["employeeId","employeeName","regularCents","overtimeCents","bonusCents","commissionCents","deductionCents","grossCents","netCents","regularHours","overtimeHours","paidLeaveHours"];
 if(!line||typeof line.employeeId!=="string"||!line.employeeId)throw Error("Invalid employee pay line");
 const result=Object.fromEntries(fields.map(k=>[k,line[k]??(k.endsWith("Hours")||k==="commissionCents"?0:"")]));
 for(const field of ["regularCents","overtimeCents","bonusCents","deductionCents","grossCents","netCents"])
  if(!Number.isSafeInteger(result[field])||result[field]<0)throw Error("Invalid simulated statement amount");
 if(result.grossCents-result.deductionCents!==result.netCents)throw Error("Statement totals do not reconcile");
 return result;
}
const escapeHtml=value=>String(value??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
const money=cents=>"$"+(cents/100).toFixed(2);
export function paystubHtml(company,run,rawLine){
 const l=sanitizeStatementLine(rawLine);
 if(run.status!=="finalized")throw Error("Only finalized simulated statements can be downloaded");
 const values=[["Regular",l.regularCents],["Overtime",l.overtimeCents],["Bonus",l.bonusCents],["Commission",l.commissionCents],["Deductions",l.deductionCents],["Gross",l.grossCents],["Net",l.netCents]];
 const rows=values.map(([label,value])=>"<tr><th>"+label+"</th><td>"+money(value)+"</td></tr>").join("");
 return "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><title>Sterling Payroll — Fictional Statement</title><style>body{font-family:Arial,sans-serif;max-width:740px;margin:35px auto;padding:24px;color:#172023}h1{font-family:Georgia,serif}h2{font-size:16px}table{width:100%;border-collapse:collapse}th,td{text-align:left;border-bottom:1px solid #ddd;padding:10px}td{text-align:right}.disclaimer{border:2px solid #ad8f50;padding:15px;margin:30px 0;font-weight:700}.muted{color:#667}.print{padding:12px;background:#12191b;color:white;border:0;border-radius:8px;cursor:pointer}@media print{.print{display:none}}</style></head><body><h1>STERLING PAYROLL</h1><div class=\"disclaimer\">SIMULATED PAYSTUB — NOT A REAL PAYMENT, TAX DOCUMENT, OR PROOF OF INCOME</div><h2>"+escapeHtml(company)+"</h2><p><strong>Employee:</strong> "+escapeHtml(l.employeeName)+"</p><p><strong>Period:</strong> "+escapeHtml(run.periodStart)+" to "+escapeHtml(run.periodEnd)+"</p><p><strong>Fictional pay date:</strong> "+escapeHtml(run.payDate)+"</p><table>"+rows+"</table><p class=\"muted\">Regular hours "+escapeHtml(l.regularHours)+" · Overtime hours "+escapeHtml(l.overtimeHours)+" · Approved paid leave "+escapeHtml(l.paidLeaveHours)+"</p><button class=\"print\" onclick=\"window.print()\">Print or save PDF</button></body></html>";
}
export function recentFinalized(runs){
 return runs.filter(r=>r.status==="finalized").sort((a,b)=>String(b.periodEnd).localeCompare(String(a.periodEnd)));
}
