import {toCents} from "./payroll-core.js";
export const INVOICE_STATES=["draft","issued","settled","void"];
export const CASE_STATES=["open","in_progress","resolved","closed"];
export function invoiceInput(description,amount){
 const d=String(description||"").trim();
 if(d.length<3||d.length>160)throw Error("Use a description between 3 and 160 characters");
 const amountCents=toCents(amount);
 if(amountCents<=0)throw Error("Simulated invoice amount must be positive");
 return {description:d,amountCents};
}
export function ticketInput(subject,details){
 const a=String(subject||"").trim(),b=String(details||"").trim();
 if(a.length<3||a.length>120||b.length<10||b.length>1500)throw Error("A subject (3–120) and details (10–1500) are required");
 return {subject:a,details:b};
}
export function summarizeInvoices(rows){
 return rows.reduce((total,r)=>{
  if(r.status==="issued")total.outstandingCents+=Number(r.amountCents)||0;
  if(r.status==="settled")total.settledCents+=Number(r.amountCents)||0;
  if(r.status==="draft")total.draftCount++;
  return total;
 },{outstandingCents:0,settledCents:0,draftCount:0});
}