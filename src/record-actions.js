import {collection,doc,getDoc,getDocs,query,where,limit,writeBatch,serverTimestamp} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js";
export function createOwnerRecordActions({db,getState,notify,onChanged}){
 const S=()=>getState();
 const dialog=document.createElement("dialog");dialog.className="sterling-dialog record-action-dialog";
 dialog.innerHTML='<h2>Delete record</h2><p id="recordDeleteSummary"></p><p class="fine-print">This action is owner-only. Related historical records must be preserved.</p><form method="dialog" id="recordDeleteForm"><label>Reason for deletion<textarea id="recordDeleteReason" maxlength="500" minlength="10" required placeholder="Why should this fictional record be deleted?"></textarea></label><div class="actions"><button class="btn" value="cancel" formnovalidate>Cancel</button><button class="btn danger" value="confirm">Delete record</button></div></form>';
 document.body.append(dialog);
 const reason=dialog.querySelector("#recordDeleteReason");
 const reasonDialog=async(kind,title)=>{
  dialog.querySelector("h2").textContent="Delete "+kind;
  dialog.querySelector("#recordDeleteSummary").textContent=title+" will be deleted if no dependent records exist.";
  reason.value="";dialog.showModal();reason.focus();
  return await new Promise(resolve=>{
   const complete=()=>resolve(dialog.returnValue==="confirm"?reason.value.trim():null);
   dialog.addEventListener("close",complete,{once:true});
  });
 };
 const tenant=()=>S().tenantId;
 const collectionRef=(kind)=>collection(db,"tenants",tenant(),kind);
 const recordRef=(kind,id)=>doc(db,"tenants",tenant(),kind,id);
 async function existsChild(ref,name){
  const snap=await getDocs(query(collection(ref,name),limit(1)));return !snap.empty;
 }
 async function ensureSafe(kind,record){
  if(kind==="employees"){
   const [links,time]=await Promise.all([
    getDocs(query(collectionRef("employeeLinks"),where("employeeId","==",record.id),limit(1))),
    getDocs(query(collectionRef("timeEntries"),where("employeeId","==",record.id),limit(1)))]);
   if(!links.empty||!time.empty)throw Error("This employee is linked to a portal or time records. Archive them instead.");
   const runs=await getDocs(query(collectionRef("payrollRuns"),limit(101)));
   if(runs.size>100)throw Error("There are too many payroll periods to verify deletion safely. Archive this employee.");
   const lineRefs=await Promise.all(runs.docs.map(r=>getDoc(doc(r.ref,"lines",record.id))));
   if(lineRefs.some(x=>x.exists()))throw Error("This employee appears in payroll history. Archive them instead.");
  }
  if(kind==="timeEntries"){
   if(record.status==="approved")throw Error("Approved time must remain for payroll audit. Use the correction workflow.");
   const corrections=await getDocs(query(collectionRef("timeCorrections"),where("timeEntryId","==",record.id),limit(1)));
   if(!corrections.empty)throw Error("This time entry has corrections and must remain available.");
  }
  if(kind==="payrollRuns"){
   if(!["draft","rejected"].includes(record.status))throw Error("Only unfinalized draft/rejected payroll can be deleted. Void or correct finalized periods in Owner Controls.");
   for(const c of ["lines","snapshots","revisions"])if(await existsChild(recordRef(kind,record.id),c))
    throw Error("This payroll period has "+c+". Preserve its history or use Owner Controls.");
  }
  if(["timeCorrections","leaveRequests"].includes(kind)&&record.status==="approved")
   throw Error("Approved correction and leave records must remain for payroll history; do not delete them.");
  if(kind==="billingInvoices"){
   if(!["draft","void"].includes(record.status))throw Error("Issue/settled invoices must be voided or retained before deletion.");
   if(await existsChild(recordRef(kind,record.id),"events"))throw Error("Invoice ledger entries exist and must be preserved; void this invoice instead.");
  }
  if(kind==="supportTickets"){
   for(const c of ["updates","internalNotes"])if(await existsChild(recordRef(kind,record.id),c))
    throw Error("This case contains conversation history. Close it instead.");
  }
 }
 async function remove(kind,record){
  if(!S().platformOwner||!S().user)throw Error("Only the trusted Sterling owner may delete records");
  const supported=["employees","timeEntries","payrollRuns","billingInvoices","supportTickets","announcements","leaveRequests","timeCorrections"];
  if(!supported.includes(kind)||!record?.id)throw Error("Unsupported record type");
  const currentTenant=tenant(),label=record.displayName||record.description||record.subject||record.title||record.workDate||record.periodStart||record.id;
  const why=await reasonDialog(kind,label);
  if(why===null)return false;
  if(why.length<10||why.length>500)throw Error("An owner deletion reason must contain 10–500 characters");
  if(currentTenant!==tenant()||!S().platformOwner)throw Error("Company or permissions changed; try again.");
  const data=await getDoc(recordRef(kind,record.id));if(!data.exists())throw Error("Record was already removed. Refresh the list.");
  const latest={id:record.id,...data.data()};
  await ensureSafe(kind,latest);
  const batch=writeBatch(db);
  batch.delete(data.ref);
  batch.set(doc(collectionRef("ownerAudit")),{action:"delete",entityType:kind,entityId:record.id,reason:why,actor:S().user.uid,at:serverTimestamp(),before:data.data()});
  batch.set(doc(collectionRef("auditEvents")),{category:"owner",action:"record-delete",subject:record.id,detail:kind+" · "+why.slice(0,240),actor:S().user.uid,at:serverTimestamp()});
  await batch.commit();
  notify("Record deleted. An owner activity entry has been retained.");
  await onChanged?.(kind);
  return true;
 }
 async function archiveEmployee(record){
  if(!S().platformOwner||!tenant())throw Error("Owner access is required");
  const current=await getDoc(recordRef("employees",record.id));if(!current.exists())throw Error("Employee record no longer exists");
  const batch=writeBatch(db);
  batch.update(current.ref,{status:"inactive",updatedAt:serverTimestamp()});
  batch.set(doc(collectionRef("ownerAudit")),{action:"archive",entityType:"employees",entityId:record.id,reason:"Owner archived fictional employee to preserve historical payroll records",actor:S().user.uid,at:serverTimestamp(),before:current.data()});
  await batch.commit();notify("Employee archived; historical records preserved.");await onChanged?.("employees");
 }
 return {remove,archiveEmployee};
}