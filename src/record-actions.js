import {collection,doc,getDoc,getDocs,query,where,limit,writeBatch,serverTimestamp} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js";
import {createDeletionEngine,deletionSummary,DELETABLE} from "./deletion-engine.js";
export function createOwnerRecordActions({db,getState,notify,onChanged,confirmAction,requestDeletion}){
 const S=()=>getState();
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
   throw Error("Approved corr const engine=createDeletionEngine({db,getState,notify});
 async function remove(kind,record){
  if(!S().platformOwner||!S().user)throw Error("Only the Sterling owner can permanently delete records");
  if(!DELETABLE.includes(kind)||!record?.id)throw Error("Select a supported record");
  const currentTenant=tenant();
  // Discover all related records before showing what the owner is authorizing.
  const operation=await engine.plan(kind,record.id,currentTenant);
  if(currentTenant!==tenant())throw Error("Company changed during dependency review");
  if(typeof requestDeletion!=="function")throw Error("Sterling confirmation dialog is unavailable");
  const confirmed=await requestDeletion({title:"Delete "+operation.title,
   message:deletionSummary(operation),recordLabel:operation.title});
  if(!confirmed)return false;
  if(currentTenant!==tenant())throw Error("Company changed during confirmation");
  await engine.execute(operation,confirmed.reason);
  await onChanged?.(kind);
  return true;
 }
er activity entry has been retained.");
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