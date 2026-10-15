import {collection,doc,getDoc,getDocs,query,where,limit,writeBatch,serverTimestamp} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js";
const requireConfirmation=(phrase,reason)=>{if(phrase!=="DELETE PERMANENTLY")throw Error("Type DELETE PERMANENTLY to confirm.");if(reason.length<10)throw Error("Please provide a deletion reason of at least 10 characters.");return reason};
export function createOwnerRecordActions({db,getState,notify,onChanged,confirmAction}){
 const S=()=>getState();
 const dialog=document.createElement("dialog");dialog.className="sterling-dialog record-action-dialog";
 dialog.innerHTML='<h2>Delete record</h2><p id="recordDeleteSummary"></p><p class="fine-print">This owner-only action is irreversible. For payroll runs, simulated pay lines, snapshots and revisions are deleted together. The deletion requires confirmation.</p><form method="dialog" id="recordDeleteForm"><label>Reason for deletion<textarea id="recordDeleteReason" maxlength="500" minlength="10" required placeholder="Why should this fictional record be deleted?"></textarea></label><label>Type DELETE PERMANENTLY to confirm<input id="recordDeletePhrase" autocomplete="off" spellcheck="false" placeholder="DELETE PERMANENTLY" required></label><div class="actions"><button class="btn" value="cancel" formnovalidate>Cancel</button><button class="btn danger" value="confirm">Delete record</button></div></form>';
 document.body.append(dialog);
 const reason=dialog.querySelector("#recordDeleteReason"),phrase=dialog.querySelector("#recordDeletePhrase");
 const reasonDialog=async(kind,title)=>{
  dialog.querySelector("h2").textContent="Delete "+kind;
  dialog.querySelector("#recordDeleteSummary").textContent=title+" will be deleted if no dependent records exist.";
  reason.value="";phrase.value="";dialog.showModal();reason.focus();
  return await new Promise(resolve=>{
   const complete=()=>resolve(dialog.returnValue==="confirm"?{reason:reason.value.trim(),phrase:phrase.value.trim()}:null);
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
  if(["timeCorrections","leaveRequests"].includes(kind)&&record.status==="approved")
   throw Error("Approved correction and leave records must remain for payroll history; do not delete them.");

 }
 async function remove(kind,record){
  if(!S().platformOwner||!S().user)throw Error("Only the trusted Sterling owner may delete records");
  const supported=["employees","timeEntries","payrollRuns","billingInvoices","supportTickets","announcements","leaveRequests","timeCorrections"];
  if(!supported.includes(kind)||!record?.id)throw Error("Unsupported record type");
  const currentTenant=tenant(),label=record.displayName||record.description||record.subject||record.title||record.workDate||record.periodStart||record.id;
  const confirmation=await reasonDialog(kind,label);
  if(confirmation===null)return false;
  const why=requireConfirmation(confirmation.phrase,confirmation.reason);
  if(why.length>500)throw Error("Deletion reason cannot exceed 500 characters.");
  if(currentTenant!==tenant()||!S().platformOwner)throw Error("Company or permissions changed; try again.");
  const data=await getDoc(recordRef(kind,record.id));if(!data.exists())throw Error("Record was already removed. Refresh the list.");
  const latest={id:record.id,...data.data()};
  await ensureSafe(kind,latest);
  const batch=writeBatch(db);
  const nested={payrollRuns:["lines","snapshots","revisions"],billingInvoices:["events"],supportTickets:["updates","internalNotes"]};
  let dependentCount=0;
  for(const child of nested[kind]||[]){
   const result=await getDocs(query(collection(data.ref,child),limit(101)));
   if(result.size>100)throw Error("Large deletion needs administrator review: more than 100 "+child+" records.");
   dependentCount+=result.size;
   if(dependentCount>400)throw Error("Too many dependent records to remove in one atomic operation.");
   result.docs.forEach(entry=>batch.delete(entry.ref));
  }
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
  if(!await confirmAction("Archive employee","Archive "+(record.displayName||"this employee")+" while preserving their fictional payroll history?"))return false;
  const batch=writeBatch(db);
  batch.update(current.ref,{status:"inactive",updatedAt:serverTimestamp()});
  batch.set(doc(collectionRef("ownerAudit")),{action:"archive",entityType:"employees",entityId:record.id,reason:"Owner archived fictional employee to preserve historical payroll records",actor:S().user.uid,at:serverTimestamp(),before:current.data()});
  await batch.commit();notify("Employee archived; historical records preserved.");await onChanged?.("employees");
 }
 return {remove,archiveEmployee};
}