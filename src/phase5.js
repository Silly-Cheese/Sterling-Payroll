import {collection,doc,addDoc,getDocs,updateDoc,query,limit,serverTimestamp} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js";
import {invoiceInput,ticketInput,summarizeInvoices,INVOICE_STATES,CASE_STATES} from "./phase5-core.js";
import {money} from "./payroll-core.js";
const E=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=String(text);return node};
const opt=(value,label)=>{const node=E("option","",label);node.value=value;return node};
export function mountPhase5({db,getState,notify,confirmAction}){
 const root=document.getElementById("phase5Suite");if(!root)return null;
 root.innerHTML='<div class="metric-grid compact" id="p5Metrics"></div><div class="ops-grid"><article class="panel"><div class="eyebrow">CLIENT BILLING • SIMULATED</div><h2>Client invoices</h2><p class="muted">Fictional service invoices only. Marking an invoice settled does not send or receive real money.</p><form id="p5InvoiceForm" class="form-stack"><label>Service description<input id="p5Description" maxlength="160" required placeholder="Simulated payroll processing"></label><label>Fictional amount (USD)<input id="p5Amount" type="number" min=".01" step=".01" required></label><button class="btn primary" type="submit">Create draft invoice</button></form><div id="p5Invoices" class="list"></div></article><article class="panel"><div class="eyebrow">CLIENT SERVICE CENTER</div><h2>Support cases</h2><p class="muted">Track client requests, questions and fictional payroll processing issues.</p><form class="form-stack" id="p5TicketForm"><label>Subject<input id="p5Subject" maxlength="120" required></label><label>Case description<textarea id="p5Details" maxlength="1500" rows="3" required></textarea></label><button class="btn primary" type="submit">Open support case</button></form><div id="p5Tickets" class="list"></div></article></div>';
 const $=id=>root.querySelector("#"+id),S=()=>getState();
 let invoices=[],tickets=[],loadedTenant="";
 const admin=()=>S().platformWrite||S().role==="client_admin";
 const member=()=>Boolean(S().platform||S().role);
 const fail=(what,e)=>notify(what+": "+(e.code||e.message||e),true);
 function select(state,values){state.replaceChildren(...values.map(x=>opt(x,x.replaceAll("_"," "))))}
 function item(title,detail,control){
  const row=E("article","list-item"),left=E("div"),right=E("div","item-actions");
  left.append(E("strong","",title),E("small","",detail));if(control)right.append(control);row.append(left,right);return row;
 }
 function stateControl(record,kind){
  const control=E("select"),states=kind==="invoice"?INVOICE_STATES:CASE_STATES;select(control,states);
  control.value=record.status;control.setAttribute("aria-label","Update "+kind+" status");
  control.onchange=async()=>{
   const before=record.status,next=control.value;
   try{
    if(!admin())throw Error("Company administration permission required");
    if(!await confirmAction("Update simulated "+kind,"Change status from "+before+" to "+next+"?")){control.value=before;return}
    const coll=kind==="invoice"?"billingInvoices":"supportTickets";
    await updateDoc(doc(db,"tenants",S().tenantId,coll,record.id),{status:next,updatedAt:serverTimestamp()});
    notify("Simulated "+kind+" updated.");await refresh();
   }catch(e){control.value=before;fail("Status change failed",e)}
  };
  return control;
 }
 function render(){
  const d=$("p5Metrics");d.replaceChildren();
  const totals=summarizeInvoices(invoices),info=[
   ["Client service tier",S().tenants.find(t=>t.id===S().tenantId)?.servicePlan||"starter"],
   ["Issued fictional invoices",money(totals.outstandingCents)],
   ["Open support cases",tickets.filter(x=>x.status==="open"||x.status==="in_progress").length]];
  for(const [name,value] of info){const cell=E("div","metric");cell.append(E("div","metric-label",name),E("strong","",value));d.append(cell)}
  $("p5InvoiceForm").classList.toggle("hidden",!admin());
  const i=$("p5Invoices");i.replaceChildren();
  for(const x of invoices){i.append(item(x.description,money(x.amountCents)+" • "+x.status+" • FICTIONAL",admin()?stateControl(x,"invoice"):null))}
  if(!invoices.length)i.textContent="No simulated invoices for this client.";
  const t=$("p5Tickets");t.replaceChildren();
  for(const x of tickets)t.append(item(x.subject,x.status+" • "+x.details,admin()?stateControl(x,"case"):null));
  if(!tickets.length)t.textContent="No support cases opened yet.";
 }
 async function refresh(){
  const tenant=S().tenantId;loadedTenant=tenant;invoices=[];tickets=[];
  if(!tenant)return;
  try{
   const [i,t]=await Promise.all([
    getDocs(query(collection(db,"tenants",tenant,"billingInvoices"),limit(151))),
    getDocs(query(collection(db,"tenants",tenant,"supportTickets"),limit(151)))
   ]);
   if(tenant!==S().tenantId)return;
   if(i.size>150||t.size>150)throw Error("Record page limit reached. Use an administrative export before adding more.");
   invoices=i.docs.map(d=>({id:d.id,...d.data()}));
   tickets=t.docs.map(d=>({id:d.id,...d.data()}));
   render();
  }catch(e){invoices=[];tickets=[];render();fail("Client service data unavailable",e)}
 }
 $("p5InvoiceForm").onsubmit=async event=>{
  event.preventDefault();
  try{
   if(!admin()||!S().tenantId)throw Error("Client admin required");
   const data=invoiceInput($("p5Description").value,$("p5Amount").value);
   await addDoc(collection(db,"tenants",S().tenantId,"billingInvoices"),{...data,status:"draft",createdBy:S().user.uid,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
   $("p5InvoiceForm").reset();notify("Fictional invoice created.");await refresh();
  }catch(e){fail("Invoice creation failed",e)}
 };
 $("p5TicketForm").onsubmit=async event=>{
  event.preventDefault();
  try{
   if(!member()||!S().tenantId)throw Error("Client membership required");
   const data=ticketInput($("p5Subject").value,$("p5Details").value);
   await addDoc(collection(db,"tenants",S().tenantId,"supportTickets"),{...data,status:"open",createdBy:S().user.uid,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
   $("p5TicketForm").reset();notify("Support case opened.");await refresh();
  }catch(e){fail("Support case creation failed",e)}
 };
 return {refresh};
}