import {toCents} from "./payroll-core.js";
export const PLANS=Object.freeze({
 starter:Object.freeze({label:"Starter",monthlyCents:4900,annualCents:49900,description:"Simple company and simulated payroll administration"}),
 standard:Object.freeze({label:"Standard",monthlyCents:12900,annualCents:129900,description:"Multiple pay periods, service priority and reporting"}),
 enterprise:Object.freeze({label:"Enterprise",monthlyCents:29900,annualCents:299900,description:"Advanced administration, exports and priority assistance"})
});
export const AGREEMENT_STATES=["trial","active","paused","cancelled"];
export const INVOICE_STATES=["draft","issued","settled","void"];
export const CASE_STATES=["open","in_progress","waiting_on_client","resolved","closed"];
export const CASE_PRIORITY=["low","normal","high","urgent"];
export const CASE_CATEGORIES=["payroll","employee","billing","technical","general"];
export const EVENT_TYPES=["payment","credit","adjustment"];
const clean=(s,max,label,min=1)=>{
 const value=String(s??"").trim();
 if(value.length<min||value.length>max)throw Error(label+" must be "+min+"–"+max+" characters");
 return value;
};
export function invoiceInput(description,amount,dueDate=""){
 const amountCents=toCents(amount);
 if(amountCents===0)throw Error("A fictional invoice needs a positive amount");
 if(dueDate&&!/^\d{4}-\d{2}-\d{2}$/.test(dueDate))throw Error("Invalid due date");
 return {description:clean(description,160,"Invoice description",3),amountCents,dueDate};
}
export function ticketInput(subject,details,priority="normal",category="general"){
 if(!CASE_PRIORITY.includes(priority)||!CASE_CATEGORIES.includes(category))throw Error("Invalid ticket priority/category");
 return {subject:clean(subject,120,"Subject",3),details:clean(details,1500,"Description",10),priority,category};
}
export function agreementInput({tier,billingCycle,status,renewalDate="",seats=0}){
 if(!Object.hasOwn(PLANS,tier)||!["monthly","annual"].includes(billingCycle)||!AGREEMENT_STATES.includes(status))throw Error("Invalid service agreement");
 if(renewalDate&&!/^\d{4}-\d{2}-\d{2}$/.test(renewalDate))throw Error("Invalid renewal date");
 const seatLimit=Number(seats);
 if(!Number.isSafeInteger(seatLimit)||seatLimit<0||seatLimit>100000)throw Error("Seat limit is invalid");
 const rateCents=billingCycle==="annual"?PLANS[tier].annualCents:PLANS[tier].monthlyCents;
 return {tier,billingCycle,status,renewalDate,seatLimit,rateCents};
}
export function canChangeInvoice(from,to){
 if(from===to)return false;
 const allowed={draft:["issued","void"],issued:["settled","void"],settled:["issued"],void:[]};
 return Boolean(allowed[from]?.includes(to));
}
export function canChangeTicket(from,to){
 if(from===to)return false;
 return CASE_STATES.includes(from)&&CASE_STATES.includes(to)&&from!=="closed";
}
export function ledgerEvent(type,amount,note){
 if(!EVENT_TYPES.includes(type))throw Error("Unsupported fictional ledger event");
 const amountCents=toCents(amount);
 if(amountCents<1)throw Error("Ledger event must be positive");
 return {type,amountCents,note:clean(note,300,"Ledger note",6)};
}
export function invoiceBalance(invoice,events=[]){
 const base=Number(invoice.amountCents)||0;
 if(!Number.isSafeInteger(base)||base<0)throw Error("Invalid fictional invoice amount");
 let paid=0,credit=0,adjustment=0;
 for(const e of events){
  if(!Number.isSafeInteger(e.amountCents)||e.amountCents<0)throw Error("Invalid fictional ledger event");
  if(e.type==="payment")paid+=e.amountCents;
  else if(e.type==="credit")credit+=e.amountCents;
  else if(e.type==="adjustment")adjustment+=e.amountCents;
 }
 return {baseCents:base,paidCents:paid,creditCents:credit,adjustmentCents:adjustment,balanceCents:Math.max(0,base+adjustment-paid-credit),overpaidCents:Math.max(0,paid+credit-base-adjustment)};
}
export function summarizeInvoices(rows){
 return rows.reduce((total,r)=>{
  if(r.status==="issued")total.outstandingCents+=(r.balanceCents??r.amountCents??0);
  if(r.status==="settled")total.settledCents+=Number(r.amountCents)||0;
  if(r.status==="draft")total.draftCount++;
  if(r.status==="void")total.voidCount++;
  return total;
 },{outstandingCents:0,settledCents:0,draftCount:0,voidCount:0});
}
export function csvEncode(rows){
 return rows.map(row=>row.map(value=>'"'+String(value??"").replace(/"/g,'""')+'"').join(",")).join("\r\n")+"\r\n";
}
export function invoicesCsv(company,rows){
 return csvEncode([["SIMULATED INVOICES — NOT REAL DEBTS OR RECEIPTS"],["Company",company],["Description","Status","Amount cents","Due date","Balance cents"],
 ...rows.map(x=>[x.description,x.status,x.amountCents,x.dueDate||"",x.balanceCents??x.amountCents])]);
}
export function ticketSla(priority){
 return {urgent:1,high:4,normal:24,low:72}[priority]||24;
}
export function ticketAgeHours(createdAt,nowMs=Date.now()){
 const seconds=createdAt?.seconds;
 if(typeof seconds!=="number")return null;
 return Math.max(0,Math.floor((nowMs-seconds*1000)/3600000));
}
export function serviceStats(invoices,tickets,nowMs=Date.now()){
 const billing=summarizeInvoices(invoices);
 const active=tickets.filter(t=>!["resolved","closed"].includes(t.status));
 return {...billing,openCases:active.length,overdueCases:active.filter(t=>{const age=ticketAgeHours(t.createdAt,nowMs);return age!==null&&age>ticketSla(t.priority)}).length};
}