import {collection,doc,getDoc,getDocs,query,orderBy,documentId,startAfter,limit,writeBatch,serverTimestamp} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js";

// Scoped roleplay data deletion. Never use this as an Auth-user delete or a real payroll retention policy.
// All source reads and writes are enforced by Firestore Rules, not by this UI.
const PAGE=100,MAX=15000,CHUNK=350;
const CHILDREN={payrollRuns:["lines","snapshots","revisions"],billingInvoices:["events"],supportTickets:["updates","internalNotes"]};
const TENANT=["members","invites","employees","timeEntries","timeCorrections","leaveRequests","payrollRuns",
 "billingInvoices","supportTickets","employeeLinks","employeePreferences","announcements",
 "serviceAgreements","assuranceSettings","payrollPolicies","auditEvents","ownerAudit",
 "employeeConversations","employeeRequests"];
export const DELETABLE=["employees","timeEntries","payrollRuns","timeCorrections","leaveRequests",
 "billingInvoices","supportTickets","announcements","members","employeeLinks","tenants"];
export function countLabel(n){return n===1?"1 record":n.toLocaleString()+" records"}
export function deletionSummary(plan){
 const related=plan.refs.length-1;
 return "Permanently delete "+plan.title+" and "+countLabel(related)+" linked/dependent records? "+
 "The selected item cannot be restored. A protected owner deletion receipt will remain.";
}
export function createDeletionEngine({db,getState,notify}){
 const state=()=>getState();
 const ensureOwner=()=>{if(!state().platformOwner||!state().user)throw Error("Only the trusted Sterling owner can permanently delete these records")};
 async function plan(kind,id,tenantId=state().tenantId){
  ensureOwner();
  if(kind==="tenants")tenantId=id;
  if(!DELETABLE.includes(kind)||!id||id.includes("/")||!tenantId||tenantId.includes("/"))throw Error("Choose one supported record within an authorized company");
  if(kind==="tenants"&&id!==tenantId)throw Error("Company scope mismatch");
  const company=doc(db,"tenants",tenantId);
  const target=kind==="tenants"?company:doc(company,kind,id);
  const original=await getDoc(target);
  if(!original.exists())throw Error("The record no longer exists; refresh and try again");
  const refs=new Map(),seen=new Set(),external=new Set(),uids=new Set();
  const add=ref=>{
   if(!refs.has(ref.path)){if(refs.size>=MAX)throw Error("Deletion exceeds 15,000 records; use a managed administrative deletion job");refs.set(ref.path,ref)}
  };
  async function scan(parent,name,keep=()=>true){
   const key=parent.path+"/"+name;if(seen.has(key))return [];
   seen.add(key);
   let cursor=null;const rows=[];
   for(;;){
    const filters=[orderBy(documentId())];
    if(cursor)filters.push(startAfter(cursor));
    filters.push(limit(PAGE));
    const snapshot=await getDocs(query(collection(parent,name),...filters));
    for(const d of snapshot.docs){if(keep(d)){add(d.ref);rows.push(d)}}
    if(snapshot.size<PAGE)break;
    cursor=snapshot.docs.at(-1);
   }
   return rows;
  }
  async function account(uid){
   await scan(doc(company,"employeeConversations",uid),"messages");
   await scan(doc(company,"employeeRequests",uid),"items");
   for(const type of ["employeePreferences","employeeConversations","employeeRequests"]){
    const d=await getDoc(doc(company,type,uid));if(d.exists())add(d.ref);
   }
  }
  async function nested(d,kindName){
   for(const name of CHILDREN[kindName]||[])await scan(d,name);
  }
  async function employee(eid){
   const links=await scan(company,"employeeLinks",x=>x.data().employeeId===eid);
   for(const link of links){uids.add(link.id);await account(link.id)}
   const times=await scan(company,"timeEntries",x=>x.data().employeeId===eid);
   const timeIds=new Set(times.map(x=>x.id));
   await scan(company,"timeCorrections",x=>timeIds.has(x.data().timeEntryId));
   await scan(company,"leaveRequests",x=>x.data().employeeId===eid);
    // All runs must be inspected, but not deleted: preserve other employees' pay.
   // scan() returns no rows when keep=false, so paginate the runs separately.
   let cursor=null;
   for(;;){
    const args=[orderBy(documentId())];if(cursor)args.push(startAfter(cursor));args.push(limit(PAGE));
    const batch=await getDocs(query(collection(company,"payrollRuns"),...args));
    for(const r of batch.docs){const line=await getDoc(doc(r.ref,"lines",eid));if(line.exists())add(line.ref)}
    if(batch.size<PAGE)break;cursor=batch.docs.at(-1);
   }
  }
  if(kind==="employees")await employee(id);
  else if(kind==="timeEntries")await scan(company,"timeCorrections",x=>x.data().timeEntryId===id);
  else if(CHILDREN[kind]){
   await nested(target,kind);
   if(kind==="payrollRuns"){
    // Include correction runs which explicitly depend on the period being removed.
    const allRuns=[];
    let cursor=null;
    for(;;){
     const args=[orderBy(documentId())];
     if(cursor)args.push(startAfter(cursor));
     args.push(limit(PAGE));
     const batch=await getDocs(query(collection(company,"payrollRuns"),...args));
     allRuns.push(...batch.docs);
     if(batch.size<PAGE)break;
     cursor=batch.docs.at(-1);
    }
    const doomed=new Set([id]);let changed=true;
    while(changed){
     changed=false;
     for(const run of allRuns){
      if(!doomed.has(run.id)&&doomed.has(run.data().correctionOf)){
       doomed.add(run.id);changed=true;
       add(run.ref);await nested(run.ref,"payrollRuns");
      }
     }
    }
   }
  }
  else if(kind==="employeeLinks")await account(id);
  else if(kind==="members"){
   await account(id);
   const link=await getDoc(doc(company,"employeeLinks",id));if(link.exists())add(link.ref);
   // userTenants is private to its owner; deletion uses known path, not a cross-user read.
   const pointer=doc(db,"userTenants",id,"items",tenantId);add(pointer);external.add(pointer.path);
  }else if(kind==="tenants"){
   for(const type of TENANT){
    const documents=["serviceAgreements","assuranceSettings","payrollPolicies"].includes(type)
     ? await (async()=>{const d=await getDoc(doc(company,type,"current"));if(d.exists()){add(d.ref);return [d]}return []})()
     : await scan(company,type);
    for(const d of documents){
     await nested(d,type);
     if(type==="members"||type==="employeeLinks")uids.add(d.id);
    }
   }
   for(const uid of uids){
    await account(uid);
    const pointer=doc(db,"userTenants",uid,"items",tenantId);add(pointer);external.add(pointer.path);
   }
  }
  refs.delete(target.path);add(target);
  const selected=target.path;
  const ordered=[...refs.values()].sort((a,b)=>a.path===selected?1:b.path===selected?-1:b.path.split("/").length-a.path.split("/").length);
  const title=original.data().displayName||original.data().subject||original.data().description||
   original.data().name||original.data().periodStart||id;
  return {kind,id,tenantId,root:selected,title,refs:ordered,externalCount:external.size};
 }
 async function execute(plan,reason){
  ensureOwner();
  if(!plan||(plan.kind!=="tenants"&&state().tenantId!==plan.tenantId))throw Error("Company changed during deletion; start again");
  if(typeof reason!=="string"||reason.length<10||reason.length>500)throw Error("A reason of 10–500 characters is required");
  const receipt=doc(collection(db,"deletionReceipts")),ownerUid=state().user.uid;
  const start=writeBatch(db);
  start.set(receipt,{kind:plan.kind,tenantId:plan.tenantId,recordPath:plan.root,
   actor:ownerUid,reason,status:"running",planned:plan.refs.length,completed:0,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
  await start.commit();
  let completed=0;
  try{
   for(let n=0;n<plan.refs.length;n+=CHUNK){
    ensureOwner();
    if(plan.kind!=="tenants"&&state().tenantId!==plan.tenantId)throw Error("Company switched during deletion");
    const chunk=plan.refs.slice(n,n+CHUNK),batch=writeBatch(db);
    for(const ref of chunk)batch.delete(ref);
    // One atomic batch also updates receipt with the matching progress.
    batch.update(receipt,{completed:completed+chunk.length,updatedAt:serverTimestamp()});
    await batch.commit();completed+=chunk.length;
   }
   const done=writeBatch(db);done.update(receipt,{status:"completed",completed,updatedAt:serverTimestamp()});await done.commit();
   notify("Permanently deleted "+countLabel(completed)+". Receipt "+receipt.id.slice(0,8)+".");
   return {receiptId:receipt.id,completed};
  }catch(error){
   try{const failed=writeBatch(db);failed.update(receipt,{status:"interrupted",completed,updatedAt:serverTimestamp()});await failed.commit()}catch{}
   throw Error("Deletion stopped after "+completed+"/"+plan.refs.length+" records. Some data may already be removed. Receipt "+receipt.id+". "+(error.message||error));
  }
 }
 return {plan,execute};
}
