import {collection,doc,getDoc,getDocs,query,orderBy,documentId,startAfter,limit,writeBatch,serverTimestamp} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js";
import {invoiceInput,ticketInput,agreementInput,ledgerEvent,invoiceBalance,canChangeInvoice,canChangeTicket,PLANS,INVOICE_STATES,CASE_STATES,serviceStats,invoicesCsv,ticketSla,ticketAgeHours} from "./phase5-core.js";
import {money} from "./payroll-core.js";
const E=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=String(text);return n};
const O=(id,label)=>{const n=E("option","",label);n.value=id;return n};
const PAGE=50;
export async function mountPhase5({db,getState,notify,confirmAction}){
 const root=document.getElementById("phase5Suite"),response=await fetch("./phase5.html?v=6");
 if(!root||!response.ok)throw Error("Client services template was not deployed");
 root.innerHTML=await response.text();
 const $=id=>root.querySelector("#"+id),S=()=>getState();
 let invoices=[],tickets=[],invoiceCursor=null,ticketCursor=null,moreInvoices=false,moreTickets=false,agreement=null,selectedInvoice="",selectedTicket="",members=[],sequence=0;
 const tenant=()=>S().tenantId,admin=()=>S().platformWrite||S().role==="client_admin";
 const member=()=>S().platform||["client_admin","payroll_specialist","viewer"].includes(S().role);
 const ref=(name,id)=>doc(db,"tenants",tenant(),name,id);
 const coll=name=>collection(db,"tenants",tenant(),name);
 const err=(name,e)=>{console.error(name,e);notify(name+": "+(e.code||e.message||String(e)),true)};
 const setOptions=(node,items)=>{const value=node.value;node.replaceChildren(...items.map(([v,label])=>O(v,label)));if(items.some(x=>x[0]===value))node.value=value};
 const dateText=v=>v||"Not scheduled";
 const readable=d=>d?.seconds?new Date(d.seconds*1000).toLocaleDateString():"Recent";
 const entry=(title,desc)=>{const wrap=E("article","service-entry"),body=E("div","service-entry-main");body.append(E("strong","",title),E("small","",desc));wrap.append(body);return wrap};
 const control=(label,handler,cls="")=>{const b=E("button","btn small "+cls,label);b.type="button";b.onclick=async()=>{b.disabled=true;try{await handler()}catch(e){err(label+" failed",e)}finally{b.disabled=false}};return b};
 const line=(label,value)=>{const div=E("div","metric");div.append(E("div","metric-label",label),E("strong","",String(value)));return div};
 async function auditedWrite(writes,event,kind,subject,detail){
  const batch=writeBatch(db);writes(batch);
  batch.set(doc(coll("auditEvents")),{category:kind,action:event,subject,detail,actor:S().user.uid,at:serverTimestamp()});
  await batch.commit();
 }
 async function page(kind,reset){
  const field=kind==="billingInvoices"?"invoice":"ticket",cursor=field==="invoice"?invoiceCursor:ticketCursor;
  const parts=[orderBy(documentId())];
  if(!reset&&cursor)parts.push(startAfter(cursor));
  parts.push(limit(PAGE+1));
  const snapshot=await getDocs(query(coll(kind),...parts));
  const shown=snapshot.docs.slice(0,PAGE);
  if(field==="invoice"){invoices=reset?shown.map(d=>({id:d.id,...d.data()})):[...invoices,...shown.map(d=>({id:d.id,...d.data()}))];invoiceCursor=shown.at(-1)||null;moreInvoices=snapshot.size>PAGE}
  else {tickets=reset?shown.map(d=>({id:d.id,...d.data()})):[...tickets,...shown.map(d=>({id:d.id,...d.data()}))];ticketCursor=shown.at(-1)||null;moreTickets=snapshot.size>PAGE}
 }
 async function refresh(){
  const generation=++sequence,current=tenant();
  invoices=[];tickets=[];invoiceCursor=ticketCursor=null;moreInvoices=moreTickets=false;agreement=null;members=[];
  selectedInvoice=selectedTicket="";
  for(const id of ["p5Invoices","p5Tickets","p5Ledger","p5Notes","p5Attention"])$(id).replaceChildren();
  if(!current){$("p5Metrics").replaceChildren();return}
  try{
   const [profile,allMembers]=await Promise.all([
    getDoc(ref("serviceAgreements","current")),
    admin()?getDocs(query(coll("members"),limit(250))):Promise.resolve(null)
   ]);
   if(generation!==sequence||current!==tenant())return;
   agreement=profile.exists()?profile.data():null;
   if(allMembers)members=allMembers.docs.map(x=>({uid:x.id,...x.data()}));
   await Promise.all([page("billingInvoices",true),page("supportTickets",true)]);
   if(generation!==sequence||current!==tenant())return;
   fillAgreement();render();
  }catch(e){if(generation!==sequence)return;invoices=[];tickets=[];render();err("Service workspace unavailable",e)}
 }
 function fillAgreement(){
  const v=agreement||{tier:S().tenants.find(x=>x.id===tenant())?.servicePlan||"starter",billingCycle:"monthly",status:"trial",renewalDate:"",seatLimit:0};
  $("p5Tier").value=v.tier;$("p5BillingCycle").value=v.billingCycle;$("p5AgreementStatus").value=v.status;
  $("p5Renewal").value=v.renewalDate||"";$("p5Seats").value=v.seatLimit||0;
  $("p5AgreementForm").classList.toggle("hidden",!admin());
  $("p5AgreementSummary").replaceChildren(E("strong","",PLANS[v.tier]?.label||"Starter"),E("small","","Simulated "+money(v.rateCents??PLANS[v.tier]?.monthlyCents??0)+" / "+v.billingCycle+" • "+v.status+" • Renewal: "+dateText(v.renewalDate)));
 }
 function render(){
  if(!tenant())return;
  const stats=serviceStats(invoices,tickets),box=$("p5Metrics");box.replaceChildren(
   line("Service plan",agreement?.tier||S().tenants.find(x=>x.id===tenant())?.servicePlan||"starter"),
   line("Outstanding · fictional",money(stats.outstandingCents)),
   line("Active cases",stats.openCases),line("SLA attention",stats.overdueCases));
  $("p5Attention").replaceChildren();
  const att=[["Open client tickets",stats.openCases],["Past target response",stats.overdueCases],["Draft invoices",stats.draftCount],["Issued fictional balance",money(stats.outstandingCents)]];
  for(const [label,value] of att){const row=entry(label,String(value));$("p5Attention").append(row)}
  $("p5InvoiceForm").classList.toggle("hidden",!admin());
  $("p5TicketForm").classList.toggle("hidden",!member());
  $("p5MoreInvoices").classList.toggle("hidden",!moreInvoices);
  $("p5MoreTickets").classList.toggle("hidden",!moreTickets);
  renderInvoices();renderTickets();
 }
 function renderInvoices(){
  const box=$("p5Invoices"),term=$("p5InvoiceSearch").value.trim().toLowerCase();box.replaceChildren();
  const results=invoices.filter(i=>[i.description,i.status,i.dueDate].join(" ").toLowerCase().includes(term));
  for(const record of results){
   const row=entry(record.description,money(record.amountCents)+" • "+record.status+" • Due "+dateText(record.dueDate));
   if(record.status==="issued"&&record.dueDate&&record.dueDate<new Date().toISOString().slice(0,10))row.classList.add("service-past-due");
   const actions=E("div","item-actions");actions.append(control("Ledger",()=>openInvoice(record.id),selectedInvoice===record.id?"primary":""));
   if(admin()){
    const next=E("select");next.setAttribute("aria-label","Invoice status for "+record.description);
    setOptions(next,INVOICE_STATES.map(x=>[x,x.replaceAll("_"," ")]));next.value=record.status;
    next.onchange=async()=>{
     const before=record.status,to=next.value;
     try{
      if(!canChangeInvoice(before,to))throw Error("That invoice state transition is not allowed");
      if(to==="settled"){
       const docs=await getDocs(query(collection(db,"tenants",tenant(),"billingInvoices",record.id,"events"),limit(101)));
       if(docs.size>100)throw Error("Ledger too long to verify");
       if(invoiceBalance(record,docs.docs.map(x=>x.data())).balanceCents!==0)throw Error("A fictional invoice may be marked settled only when its ledger balance is zero");
      }
      if(!await confirmAction("Change invoice state","Change this fictional invoice to "+to+"?")){next.value=before;return}
      await auditedWrite(b=>b.update(ref("billingInvoices",record.id),{status:to,updatedAt:serverTimestamp()}),"invoice-status","billing",record.id,before+" → "+to);
      await refresh();notify("Invoice updated.");
     }catch(e){next.value=before;err("Invoice status failed",e)}
    };
    actions.append(next);
   }
   row.append(actions);box.append(row);
  }
  if(!results.length)box.append(E("p","muted","No matching invoices. Use the search or create a new draft."));
 }
 function renderTickets(){
  const box=$("p5Tickets"),term=$("p5TicketSearch").value.trim().toLowerCase(),filter=$("p5TicketFilter").value;box.replaceChildren();
  const filtered=tickets.filter(x=>(filter==="all"||filter===x.status)&&[x.subject,x.details,x.category].join(" ").toLowerCase().includes(term));
  for(const t of filtered){
   const age=ticketAgeHours(t.createdAt),overdue=age!==null&&age>ticketSla(t.priority)&&!["resolved","closed"].includes(t.status);
   const row=entry(t.subject,t.category+" • "+t.priority+" • "+t.status+(overdue?" • target exceeded":""));
   if(overdue)row.classList.add("service-past-due");
   const actions=E("div","item-actions");actions.append(control("Open case",()=>openTicket(t.id),selectedTicket===t.id?"primary":""));
   if(admin()){
    const state=E("select");state.setAttribute("aria-label","Support case status");
    setOptions(state,CASE_STATES.map(x=>[x,x.replaceAll("_"," ")]));state.value=t.status;
    state.onchange=async()=>{const before=t.status,next=state.value;try{
     if(!canChangeTicket(before,next))throw Error("Closed tickets cannot be changed; open a new case");
     await auditedWrite(b=>b.update(ref("supportTickets",t.id),{status:next,updatedAt:serverTimestamp()}),"ticket-status","support",t.id,before+" → "+next);
     await refresh();notify("Support case updated.");
    }catch(e){state.value=before;err("Support update failed",e)}};
    actions.append(state);
   }
   row.append(actions);box.append(row);
  }
  $("p5SupportCount").textContent=tickets.length+(moreTickets?"+":"")+" cases";
  if(!filtered.length)box.append(E("p","muted","No cases match these filters."));
 }
 async function openInvoice(id){
  selectedInvoice=id;const record=invoices.find(x=>x.id===id);if(!record)return;
  $("p5SelectedInvoice").textContent=record.description+" • "+money(record.amountCents)+" • "+record.status;
  const snap=await getDocs(query(collection(db,"tenants",tenant(),"billingInvoices",id,"events"),limit(101)));
  const box=$("p5Ledger");box.replaceChildren();if(snap.size>100){box.textContent="Ledger exceeds 100 entries. Export/management support required.";return}
  const events=snap.docs.map(x=>x.data()),totals=invoiceBalance(record,events);
  box.append(entry("Remaining fictional balance",money(totals.balanceCents)+" • paid "+money(totals.paidCents)+" • credits "+money(totals.creditCents)));
  for(const e of events.sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)))box.append(entry(e.type+" · "+money(e.amountCents),e.note+" • "+readable(e.createdAt)));
  $("p5EventForm").classList.toggle("hidden",!admin()||record.status==="void");
  renderInvoices();
 }
 async function openTicket(id){
  selectedTicket=id;const ticket=tickets.find(x=>x.id===id);if(!ticket)return;
  const box=$("p5SelectedTicket");box.replaceChildren(E("strong","",ticket.subject),E("small","",ticket.details));
  if(admin()){
   const assign=E("select");setOptions(assign,[["","Unassigned"],...members.filter(x=>x.status==="active").map(x=>[x.uid,x.email||"Team member"])]);
   assign.value=ticket.assignedUid||"";
   assign.setAttribute("aria-label","Support case assignee");
   assign.onchange=async()=>{try{
    await auditedWrite(b=>b.update(ref("supportTickets",id),{assignedUid:assign.value,updatedAt:serverTimestamp()}),"ticket-assignment","support",id,assign.value||"Unassigned");
    notify("Case assignment saved.");await refresh();await openTicket(id);
   }catch(e){err("Assignment failed",e)}};box.append(assign);
  }
  const [publicNotes,privateNotes]=await Promise.all([
   getDocs(query(collection(db,"tenants",tenant(),"supportTickets",id,"updates"),limit(101))),
   admin()?getDocs(query(collection(db,"tenants",tenant(),"supportTickets",id,"internalNotes"),limit(101))):Promise.resolve(null)
  ]);
  const notes=$("p5Notes");notes.replaceChildren();
  if(publicNotes.size>100||(privateNotes&&privateNotes.size>100)){notes.textContent="Conversation exceeds the current 100-item limit.";return}
  const all=[...publicNotes.docs.map(x=>({...x.data(),internal:false})),...(privateNotes?.docs.map(x=>({...x.data(),internal:true}))||[])];
  all.sort((a,b)=>(a.createdAt?.seconds||0)-(b.createdAt?.seconds||0));
  for(const entryData of all)notes.append(entry(entryData.internal?"Internal staff note":"Client update",entryData.body+" • "+readable(entryData.createdAt)));
  if(!all.length)notes.append(E("p","muted","No updates yet."));
  $("p5NoteForm").classList.toggle("hidden",!member());
  $("p5Internal").disabled=!admin();$("p5Internal").checked=false;
  renderTickets();
 }
 $("p5InvoiceForm").onsubmit=async event=>{event.preventDefault();try{
  if(!admin())throw Error("Client administrator required");
  const input=invoiceInput($("p5Description").value,$("p5Amount").value,$("p5Due").value),newRef=doc(coll("billingInvoices"));
  await auditedWrite(batch=>batch.set(newRef,{...input,status:"draft",createdBy:S().user.uid,createdAt:serverTimestamp(),updatedAt:serverTimestamp()}),"invoice-create","billing",newRef.id,input.description);
  $("p5InvoiceForm").reset();await refresh();notify("Fictional invoice created.");
 }catch(e){err("Invoice creation failed",e)}};
 $("p5TicketForm").onsubmit=async event=>{event.preventDefault();try{
  if(!member())throw Error("Authorized client membership required");
  const input=ticketInput($("p5Subject").value,$("p5Details").value,$("p5Priority").value,$("p5Category").value),newRef=doc(coll("supportTickets"));
  await auditedWrite(batch=>batch.set(newRef,{...input,status:"open",assignedUid:"",createdBy:S().user.uid,createdAt:serverTimestamp(),updatedAt:serverTimestamp()}),"ticket-create","support",newRef.id,input.subject);
  $("p5TicketForm").reset();await refresh();notify("Support case opened.");
 }catch(e){err("Case creation failed",e)}};
 $("p5AgreementForm").onsubmit=async event=>{event.preventDefault();try{
  if(!admin())throw Error("Client administrator required");
  const value=agreementInput({tier:$("p5Tier").value,billingCycle:$("p5BillingCycle").value,status:$("p5AgreementStatus").value,renewalDate:$("p5Renewal").value,seats:$("p5Seats").value});
  const before=agreement?.tier||"none";
  if(!await confirmAction("Update service agreement","Save the "+value.tier+" simulated agreement?"))return;
  await auditedWrite(b=>b.set(ref("serviceAgreements","current"),{...value,updatedBy:S().user.uid,updatedAt:serverTimestamp()}),"agreement-save","service","current",before+" → "+value.tier);
  await refresh();notify("Client service agreement saved.");
 }catch(e){err("Agreement failed",e)}};
 $("p5EventForm").onsubmit=async event=>{event.preventDefault();try{
  if(!admin())throw Error("Client administrator required");
  const invoice=invoices.find(x=>x.id===selectedInvoice);if(!invoice)throw Error("Choose an invoice");
  const value=ledgerEvent($("p5EventType").value,$("p5EventAmount").value,$("p5EventNote").value);
  const existing=await getDocs(query(collection(db,"tenants",tenant(),"billingInvoices",invoice.id,"events"),limit(101)));
  if(existing.size>100)throw Error("Ledger reached its review limit");
  const balance=invoiceBalance(invoice,[...existing.docs.map(x=>x.data()),value]);
  if(balance.overpaidCents>0)throw Error("Ledger would exceed the fictional amount due");
  if(!await confirmAction("Record fictional transaction","Record "+value.type+" of "+money(value.amountCents)+"? This is not a real payment."))return;
  const newRef=doc(collection(db,"tenants",tenant(),"billingInvoices",invoice.id,"events"));
  await auditedWrite(batch=>batch.set(newRef,{...value,createdBy:S().user.uid,createdAt:serverTimestamp()}),"ledger-entry","billing",invoice.id,value.type+" "+money(value.amountCents));
  $("p5EventForm").reset();await openInvoice(invoice.id);notify("Fictional ledger event saved.");
 }catch(e){err("Ledger event failed",e)}};
 $("p5NoteForm").onsubmit=async event=>{event.preventDefault();try{
  if(!member()||!selectedTicket)throw Error("Choose a support case");
  const body=$("p5NoteText").value.trim(),internal=$("p5Internal").checked;
  if(body.length<2||body.length>1600)throw Error("Message must be 2–1600 characters");
  if(internal&&!admin())throw Error("Internal notes require client administrator permissions");
  const newRef=doc(collection(db,"tenants",tenant(),"supportTickets",selectedTicket,internal?"internalNotes":"updates"));
  await auditedWrite(batch=>batch.set(newRef,{body,createdBy:S().user.uid,createdAt:serverTimestamp()}),internal?"internal-note":"case-update","support",selectedTicket,body.slice(0,80));
  $("p5NoteForm").reset();await openTicket(selectedTicket);notify("Case update saved.");
 }catch(e){err("Case message failed",e)}};
 $("p5InvoiceSearch").oninput=renderInvoices;$("p5TicketSearch").oninput=renderTickets;$("p5TicketFilter").onchange=renderTickets;
 $("p5Refresh").onclick=()=>void refresh();
 $("p5MoreInvoices").onclick=async()=>{try{await page("billingInvoices",false);render()}catch(e){err("Invoice pagination failed",e)}};
 $("p5MoreTickets").onclick=async()=>{try{await page("supportTickets",false);render()}catch(e){err("Case pagination failed",e)}};
 $("p5Export").onclick=()=>{
  if(!tenant())return;
  const company=S().tenants.find(t=>t.id===tenant())?.name||"Client";
  const data=invoicesCsv(company,invoices),file=new Blob([data],{type:"text/csv;charset=utf-8"}),url=URL.createObjectURL(file);
  const link=E("a");link.href=url;link.download="Sterling-Simulated-Client-Statement.csv";link.click();setTimeout(()=>URL.revokeObjectURL(url),3000);
  notify(moreInvoices?"Exported loaded invoice pages only. Load all pages for a full register.":"Simulated invoice statement downloaded.");
 };
 for(const tab of root.querySelectorAll("[data-p5-tab]"))tab.onclick=()=>{
  const target=tab.dataset.p5Tab;
  for(const n of root.querySelectorAll("[data-p5-tab]"))n.classList.toggle("active",n===tab);
  for(const n of root.querySelectorAll("[data-p5-panel]"))n.classList.toggle("hidden",n.dataset.p5Panel!==target);
 };
 return {refresh};
}