import {collection,doc,getDoc,getDocs,query,orderBy,documentId,startAfter,limit,writeBatch,serverTimestamp} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js";
import {assessIntegrity,retentionPolicy,exportPackage,EXPORT_COLLECTIONS,reportMetrics} from "./phase6-core.js";
import {money} from "./payroll-core.js";
const E=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=String(text);return n};
const COUNT=125,MAX_EXPORT=750;
export async function mountPhase6({db,getState,notify,confirmAction}){
 const root=document.getElementById("phase6Suite");if(!root)return null;
 const response=await fetch("./phase6.html?v=6");if(!response.ok)throw Error("Assurance center template not deployed");
 root.innerHTML=await response.text();
 const $=id=>root.querySelector("#"+id),S=()=>getState();
 let source={},partial={},logs=[],cursor=null,moreAudit=false,activeTenant="",generation=0;
 const tenant=()=>S().tenantId,admin=()=>S().platformWrite||S().role==="client_admin";
 const col=name=>collection(db,"tenants",tenant(),name),record=(name,id)=>doc(db,"tenants",tenant(),name,id);
 const fail=(heading,e)=>{console.error(heading,e);notify(heading+": "+(e.code||e.message||String(e)),true)};
 const addRow=(target,title,description,type="")=>{
  const row=E("article","assurance-row "+type);row.append(E("strong","",title),E("small","",description));target.append(row);
 };
 function reset(){
  source={};partial={};logs=[];cursor=null;moreAudit=false;
  for(const k of ["p6Metrics","p6Findings","p6Health","p6Audit"])$(k).replaceChildren();
  $("p6Coverage").textContent="Run checks to inspect the currently selected company.";
  $("p6MoreAudit").classList.add("hidden");
 }
 async function readPage(kind,after=null,size=COUNT){
  const clauses=[orderBy(documentId())];if(after)clauses.push(startAfter(after));
  clauses.push(limit(size+1));
  return await getDocs(query(col(kind),...clauses));
 }
 async function auditPage(clear=false){
  if(clear){logs=[];cursor=null}
  const docs=await readPage("auditEvents",cursor,50);
  const next=docs.docs.slice(0,50);
  logs.push(...next.map(x=>({id:x.id,...x.data()})));
  cursor=next.at(-1)||null;moreAudit=docs.size>50;
  $("p6MoreAudit").classList.toggle("hidden",!moreAudit);
  renderAudit();
 }
 function renderAudit(){
  const term=$("p6AuditSearch").value.trim().toLowerCase(),target=$("p6Audit");target.replaceChildren();
  const shown=logs.filter(log=>[log.category,log.action,log.detail,log.subject].join(" ").toLowerCase().includes(term));
  for(const log of shown.sort((a,b)=>(b.at?.seconds||0)-(a.at?.seconds||0))){
   const date=log.at?.seconds?new Date(log.at.seconds*1000).toLocaleString():"Recent";
   addRow(target,log.action+" • "+log.category,(log.detail||"")+" — "+date);
  }
  if(!shown.length)addRow(target,"No matching activity","This list shows authenticated activity recorded by integrated client-service operations.");
 }
 async function checkAssets(){
  const files=["./src/app.js","./src/phase4.js","./src/phase5.js","./src/phase6.js","./phase6.html"];
  const checks=await Promise.all(files.map(async file=>{
   try{const response=await fetch(file+"?check="+encodeURIComponent("6"),{method:"HEAD",cache:"no-store"});
    return {name:file,status:response.ok?"Available":"HTTP "+response.status,ok:response.ok}}
   catch(e){return {name:file,status:"Network unavailable",ok:false}}
  }));
  const div=$("p6Health");div.replaceChildren();
  for(const c of checks)addRow(div,c.name,c.status,c.ok?"assurance-ok":"assurance-error");
  addRow(div,"Authorization","Authenticated as "+(S().platformOwner?"Sterling owner":S().role||"client")+"; access is enforced by Firestore rules.");
  return checks;
 }
 function report(){
  const sourceData={employees:source.employees||[],timeEntries:source.timeEntries||[],runs:source.payrollRuns||[],invoices:source.billingInvoices||[],tickets:source.supportTickets||[]};
  const result=assessIntegrity({...sourceData,partial}),metrics=reportMetrics(sourceData);
  $("p6Metrics").replaceChildren();
  for(const [label,value] of [["Active fictional staff",metrics.activeEmployees],["Finalized periods",metrics.finalizedPeriods],["Open cases",metrics.openCases],["Issued fictional amount",money(metrics.fictionalReceivablesCents)]]){
   const panel=E("div","metric");panel.append(E("div","metric-label",label),E("strong","",String(value)));$("p6Metrics").append(panel);
  }
  const findings=$("p6Findings");findings.replaceChildren();
  if(!result.issues.length)addRow(findings,"No structural errors detected","Within the records sampled by this browser.", "assurance-ok");
  for(const issue of result.issues.slice(0,25))addRow(findings,"Integrity exception",issue,"assurance-error");
  for(const warning of result.warnings.slice(0,25))addRow(findings,"Review recommended",warning,"assurance-warning");
  $("p6Coverage").textContent="Scanned "+result.scanned.employees+" employee profiles, "+result.scanned.timeEntries+" time entries, "+result.scanned.runs+" runs, "+result.scanned.invoices+" invoices, "+result.scanned.tickets+" tickets. "+(result.complete?"No page caps detected.":"Results are incomplete: data exceeded a page cap.")+" These checks are not an external financial audit.";
 }
 async function refresh(){
  const generationId=++generation,current=tenant();
  reset();activeTenant=current;
  if(!current)return;
  if(!admin()){addRow($("p6Health"),"Restricted","Only company administrators may run integrity checks and download client exports.");return}
  try{
   const kinds=["employees","timeEntries","payrollRuns","billingInvoices","supportTickets"];
   const [results,settings]=await Promise.all([
    Promise.all(kinds.map(k=>readPage(k))),
    getDoc(record("assuranceSettings","current"))
   ]);
   if(generationId!==generation||current!==tenant())return;
   kinds.forEach((k,i)=>{source[k]=results[i].docs.slice(0,COUNT).map(d=>({id:d.id,...d.data()}));partial[k]=results[i].size>COUNT});
   if(settings.exists()){
    $("p6Retention").value=String(settings.data().reviewAfterDays||365);
    $("p6Hold").checked=settings.data().legalHold===true;
   }
   report();await Promise.all([auditPage(true),checkAssets()]);
  }catch(e){if(generationId!==generation)return;reset();fail("Assurance check failed",e)}
 }
 async function completeExport(){
  if(!admin()||!tenant())throw Error("Client administrator role required");
  const active=tenant(),collections={},capped={};
  for(const kind of EXPORT_COLLECTIONS){
   let docs=[],after=null,extra=false;
   for(let i=0;i<Math.ceil(MAX_EXPORT/COUNT);i++){
    const snapshot=await readPage(kind,after,COUNT);
    const chunk=snapshot.docs.slice(0,COUNT);
    docs.push(...chunk.map(d=>({id:d.id,...d.data()})));
    extra=snapshot.size>COUNT;
    after=chunk.at(-1)||null;
    if(!extra||!after)break;
   }
   collections[kind]=docs;capped[kind]=extra;
   if(tenant()!==active)throw Error("Company changed during export. No file has been produced.");
  }
  const client=S().tenants.find(x=>x.id===active);
  if(!client)throw Error("Client workspace not found");
  const bundle=exportPackage({client,collections,partial:capped});
  const file=new Blob([JSON.stringify(bundle,null,2)],{type:"application/json"});
  const url=URL.createObjectURL(file),link=E("a");link.href=url;link.download="Sterling-SIMULATED-client-export-"+active.slice(0,8)+".json";
  document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);
  const incomplete=Object.values(capped).some(Boolean);
  $("p6ExportStatus").textContent=(incomplete?"PARTIAL EXPORT — page limit reached. ":"Export completed. ")+
   "Records: "+Object.entries(collections).map(([k,v])=>k+": "+v.length).join(", ")+". This is not a directly restorable Firebase backup.";
  notify(incomplete?"Export saved with a PARTIAL flag.":"Simulation-only client export saved.");
 }
 $("p6Refresh").onclick=()=>void refresh();
 $("p6MoreAudit").onclick=async()=>{try{await auditPage(false)}catch(e){fail("Activity pagination failed",e)}};
 $("p6AuditSearch").oninput=renderAudit;
 $("p6Export").onclick=async()=>{
  try{
   if(!await confirmAction("Export client records","Export this client's fictional operational records as JSON? No authentication secrets or private conversations will be included."))return;
   await completeExport();
  }catch(e){fail("Client export failed",e)}
 };
 $("p6PolicyForm").onsubmit=async event=>{
  event.preventDefault();try{
   if(!admin()||!tenant())throw Error("Client administrator role required");
   const value=retentionPolicy($("p6Retention").value,$("p6Hold").checked);
   const batch=writeBatch(db);
   batch.set(record("assuranceSettings","current"),{...value,updatedBy:S().user.uid,updatedAt:serverTimestamp()});
   batch.set(doc(col("auditEvents")),{category:"assurance",action:"retention-preference",subject:"client",detail:"Review after "+value.reviewAfterDays+" days / hold "+value.legalHold,actor:S().user.uid,at:serverTimestamp()});
   await batch.commit();notify("Advisory retention preference saved. No records were deleted.");
  }catch(e){fail("Retention update failed",e)}
 };
 return {refresh};
}