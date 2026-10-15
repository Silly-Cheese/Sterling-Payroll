import {collection,doc,getDoc,writeBatch,serverTimestamp} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js";
import {createDeletionEngine,deletionSummary,DELETABLE} from "./deletion-engine.js";
export function createOwnerRecordActions({db,getState,notify,onChanged,confirmAction,requestDeletion}){
 const S=()=>getState(),tenant=()=>S().tenantId;
 const engine=createDeletionEngine({db,getState,notify});
 async function remove(kind,record){
  if(!S().platformOwner||!S().user)throw Error("Only the Sterling owner can permanently delete records");
  if(!DELETABLE.includes(kind)||!record?.id)throw Error("Choose a valid record");
  const currentTenant=tenant();
  const plan=await engine.plan(kind,record.id,currentTenant);
  if(currentTenant!==tenant())throw Error("Company changed during deletion review");
  if(typeof requestDeletion!=="function")throw Error("The custom deletion confirmation is unavailable");
  const approval=await requestDeletion({title:"Delete "+plan.title,message:deletionSummary(plan),recordLabel:plan.title});
  if(!approval)return false;
  if(currentTenant!==tenant())throw Error("Company changed during deletion confirmation");
  await engine.execute(plan,approval.reason);
  await onChanged?.(kind);
  return true;
 }
 async function archiveEmployee(record){
  if(!S().platformOwner||!tenant())throw Error("Owner access is required");
  const current=await getDoc(doc(db,"tenants",tenant(),"employees",record.id));
  if(!current.exists())throw Error("Employee record no longer exists");
  if(!await confirmAction("Archive employee","Archive "+(record.displayName||"this employee")+" while preserving all fictional payroll history?"))return false;
  const batch=writeBatch(db);
  batch.update(current.ref,{status:"inactive",updatedAt:serverTimestamp()});
  batch.set(doc(collection(db,"tenants",tenant(),"ownerAudit")),{
   action:"archive",entityType:"employees",entityId:record.id,
   reason:"Owner archived the fictional employee while retaining historical payroll",
   actor:S().user.uid,at:serverTimestamp(),before:current.data()
  });
  await batch.commit();
  notify("Employee archived; historical records preserved.");
  await onChanged?.("employees");
  return true;
 }
 return {remove,archiveEmployee};
}