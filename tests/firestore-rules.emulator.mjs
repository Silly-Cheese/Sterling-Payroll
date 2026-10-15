import test,{before,after,beforeEach} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {initializeTestEnvironment,assertSucceeds,assertFails} from "@firebase/rules-unit-testing";
import {doc,collection,getDoc,getDocs,setDoc,updateDoc,deleteDoc,writeBatch,serverTimestamp} from "firebase/firestore";

let env;
before(async()=>{
 env=await initializeTestEnvironment({projectId:"demo-sterling-payroll",firestore:{rules:readFileSync(new URL("../firestore.rules",import.meta.url),"utf8")}});
});
after(async()=>{await env?.cleanup()});
beforeEach(async()=>{
 await env.clearFirestore();
 await env.withSecurityRulesDisabled(async context=>{
  const db=context.firestore();
  for(const t of ["north","south"])await setDoc(doc(db,"tenants",t),{name:t,status:"active",servicePlan:"starter"});
  await setDoc(doc(db,"platformAdmins","owner"),{role:"owner",active:true});
  for(const [id,email] of [["owner","owner@demo.invalid"],["admin","admin@demo.invalid"],["viewer","viewer@demo.invalid"],["employee","employee@demo.invalid"],["stranger","stranger@demo.invalid"]])await setDoc(doc(db,"accounts",id),{email,displayName:id,accountType:"client"});
  for(const [uid,role] of [["admin","client_admin"],["viewer","viewer"],["employee","employee"]])
   await setDoc(doc(db,"tenants","north","members",uid),{email:uid+"@demo.invalid",status:"active",role});
  await setDoc(doc(db,"tenants","north","employees","e1"),{displayName:"Fictional Employee"});
  await setDoc(doc(db,"tenants","north","employees","e2"),{displayName:"Other Person"});
  await setDoc(doc(db,"tenants","north","employeeLinks","employee"),{employeeId:"e1",linkedBy:"admin"});
  await setDoc(doc(db,"tenants","north","payrollRuns","p1"),{status:"finalized",periodStart:"2026-10-01",periodEnd:"2026-10-14",payDate:"2026-10-16",finalizedBy:"admin"});
  for(const [uid,name] of [["e1","Fictional Employee"],["e2","Other Person"]])
   await setDoc(doc(db,"tenants","north","payrollRuns","p1","lines",uid),{employeeId:uid,employeeName:name,regularCents:1000,overtimeCents:0,bonusCents:0,deductionCents:0,grossCents:1000,netCents:1000,regularHours:1,overtimeHours:0});
  await setDoc(doc(db,"tenants","north","billingInvoices","i1"),{status:"draft",description:"Mock processing",amountCents:1000});
  await setDoc(doc(db,"tenants","north","supportTickets","s1"),{subject:"Sample request",status:"open",details:"Sample details"});
  await setDoc(doc(db,"tenants","north","supportTickets","s1","internalNotes","n1"),{body:"Internal only"});
 });
});
const as=uid=>env.authenticatedContext(uid,{email:uid+"@demo.invalid"}).firestore();

test("unassigned client cannot read tenant or grant staff access",async()=>{
 const db=as("stranger");
 await assertFails(getDoc(doc(db,"tenants","north")));
 await assertFails(setDoc(doc(db,"platformStaff","stranger"),{role:"administrator",active:true,grantedBy:"stranger",updatedAt:serverTimestamp()}));
});
test("scoped viewer reads only their own active company and no other tenant",async()=>{
 const db=as("viewer");
 await assertSucceeds(getDoc(doc(db,"tenants","north")));
 await assertFails(getDoc(doc(db,"tenants","south")));
 await assertFails(setDoc(doc(db,"tenants","north","billingInvoices","new"),{description:"Cannot write",amountCents:500,status:"draft"}));
});
test("employee can read own finalized fictional pay line but not other employee or list",async()=>{
 const db=as("employee");
 await assertSucceeds(getDoc(doc(db,"tenants","north","payrollRuns","p1","lines","e1")));
 await assertFails(getDoc(doc(db,"tenants","north","payrollRuns","p1","lines","e2")));
 await assertFails(getDocs(collection(db,"tenants","north","employees")));
 await assertFails(getDocs(collection(db,"tenants","north","payrollRuns","p1","lines")));
});
test("staff-only support notes do not leak to read-only clients",async()=>{
 await assertFails(getDoc(doc(as("viewer"),"tenants","north","supportTickets","s1","internalNotes","n1")));
 await assertSucceeds(getDoc(doc(as("admin"),"tenants","north","supportTickets","s1","internalNotes","n1")));
});
test("invoice cannot skip issued step and client cannot forge ledger",async()=>{
 const a=as("admin"),v=as("viewer");
 await assertFails(updateDoc(doc(a,"tenants","north","billingInvoices","i1"),{status:"settled",updatedAt:serverTimestamp()}));
 await assertSucceeds(updateDoc(doc(a,"tenants","north","billingInvoices","i1"),{status:"issued",updatedAt:serverTimestamp()}));
 await assertFails(setDoc(doc(v,"tenants","north","billingInvoices","i1","events","ev"),{type:"payment",amountCents:100,note:"fake entry",createdBy:"viewer",createdAt:serverTimestamp()}));
 await assertSucceeds(setDoc(doc(a,"tenants","north","billingInvoices","i1","events","ev"),{type:"payment",amountCents:100,note:"Simulated payment",createdBy:"admin",createdAt:serverTimestamp()}));
 await assertFails(deleteDoc(doc(a,"tenants","north","billingInvoices","i1","events","ev")));
});
test("trusted owner can grant staff but viewer cannot create platform role",async()=>{
 const owner=as("owner"),viewer=as("viewer");
 const data={role:"support",active:true,grantedBy:"owner",updatedAt:serverTimestamp()};
 await assertSucceeds(setDoc(doc(owner,"platformStaff","stranger"),data));
 await assertFails(setDoc(doc(viewer,"platformStaff","viewer"),{...data,grantedBy:"viewer"}));
});
test("owner correction without an immutable revision is rejected",async()=>{
 const owner=as("owner");
 await assertFails(updateDoc(doc(owner,"tenants","north","payrollRuns","p1","lines","e1"),{netCents:2000}));
});
test("a client viewer cannot forge an operational audit record or retention settings",async()=>{
 const db=as("viewer");
 await assertFails(setDoc(doc(db,"tenants","north","auditEvents","x"),{category:"billing",action:"fake",subject:"invoice",detail:"fake",actor:"viewer",at:serverTimestamp()}));
 await assertFails(setDoc(doc(db,"tenants","north","assuranceSettings","current"),{reviewAfterDays:365,legalHold:false,updatedBy:"viewer",updatedAt:serverTimestamp()}));
});

test("trusted owner can correct a finalized pay line in place only with a linked immutable revision",async()=>{
 const db=as("owner"),lineRef=doc(db,"tenants","north","payrollRuns","p1","lines","e1");
 const original=(await getDoc(lineRef)).data();
 const revisionId="revision-one",changed={...original,regularCents:1500,grossCents:1500,netCents:1500,
  lastRevisionId:revisionId,lastCorrectedBy:"owner",lastCorrectedAt:serverTimestamp()};
 const batch=writeBatch(db);
 batch.set(doc(db,"tenants","north","payrollRuns","p1","revisions",revisionId),{
  kind:"line",entityId:"e1",reason:"Owner corrected fictional regular earnings",actor:"owner",at:serverTimestamp(),before:original,after:changed});
 batch.update(lineRef,changed);
 await assertSucceeds(batch.commit());
 assert.equal((await getDoc(lineRef)).data().netCents,1500);
});

test("client viewer can open a scoped support ticket without permission to fake an audit event",async()=>{
 const db=as("viewer");
 await assertSucceeds(setDoc(doc(db,"tenants","north","supportTickets","client-case"),{
  subject:"Sample payroll question",details:"This is a fictional support case.",priority:"normal",category:"payroll",
  status:"open",assignedUid:"",createdBy:"viewer",createdAt:serverTimestamp(),updatedAt:serverTimestamp()
 }));
 await assertFails(setDoc(doc(db,"tenants","north","auditEvents","fake"),{
  category:"support",action:"fake",subject:"client-case",detail:"not allowed",actor:"viewer",at:serverTimestamp()
 }));
});

test("record-level deletion requires trusted owner and leaves owner activity history",async()=>{
 const target="tenants/north/supportTickets/owner-removable";
 await env.withSecurityRulesDisabled(async context=>{
  await setDoc(doc(context.firestore(),target),{subject:"Fictional empty case",status:"closed",details:"No child conversation"});
 });
 const viewer=as("viewer");
 await assertFails(deleteDoc(doc(viewer,target)));
 const owner=as("owner"),recordRef=doc(owner,target),batch=writeBatch(owner);
 batch.delete(recordRef);
 batch.set(doc(owner,"tenants","north","ownerAudit","deletion-test"),{
  action:"delete",entityType:"supportTickets",entityId:"owner-removable",
  reason:"Remove empty fictional test case",actor:"owner",at:serverTimestamp(),
  before:{subject:"Fictional empty case",status:"closed",details:"No child conversation"}
 });
 await assertSucceeds(batch.commit());
 assert.equal((await getDoc(recordRef)).exists(),false);
 await assertSucceeds(getDoc(doc(owner,"tenants","north","ownerAudit","deletion-test")));
});

test("owner can delete finalized pay period with lines, snapshots and revisions atomically",async()=>{
 await env.withSecurityRulesDisabled(async c=>{
  const d=c.firestore();
  await setDoc(doc(d,"tenants","north","payrollRuns","p1","snapshots","s1"),{sample:"fictional"});
  await setDoc(doc(d,"tenants","north","payrollRuns","p1","revisions","v1"),{sample:"fictional"});
 });
 const owner=as("owner"),viewer=as("viewer");
 const paths=["tenants/north/payrollRuns/p1/lines/e1","tenants/north/payrollRuns/p1/lines/e2",
  "tenants/north/payrollRuns/p1/snapshots/s1","tenants/north/payrollRuns/p1/revisions/v1",
  "tenants/north/payrollRuns/p1"];
 const denied=writeBatch(viewer);
 for(const p of paths)denied.delete(doc(viewer,p));
 await assertFails(denied.commit());
 const permitted=writeBatch(owner);
 for(const p of paths)permitted.delete(doc(owner,p));
 permitted.set(doc(owner,"tenants","north","ownerAudit","deleted-period"),{
  action:"delete",entityType:"payrollRuns",entityId:"p1",reason:"Owner removed fictional test payroll period",
  actor:"owner",at:serverTimestamp(),before:{status:"finalized"}
 });
 await assertSucceeds(permitted.commit());
 for(const p of paths)assert.equal((await getDoc(doc(owner,p))).exists(),false);
 await assertSucceeds(getDoc(doc(owner,"tenants","north","ownerAudit","deleted-period")));
});
test("owner can delete simulated invoice events and support conversations",async()=>{
 await env.withSecurityRulesDisabled(async c=>{
  const db=c.firestore();
  await setDoc(doc(db,"tenants","north","billingInvoices","i1","events","e1"),{type:"payment",amountCents:500});
  await setDoc(doc(db,"tenants","north","supportTickets","s1","updates","u1"),{body:"Fictional update"});
 });
 const owner=as("owner");
 const batch=writeBatch(owner);
 for(const p of ["tenants/north/billingInvoices/i1/events/e1","tenants/north/billingInvoices/i1",
  "tenants/north/supportTickets/s1/internalNotes/n1","tenants/north/supportTickets/s1/updates/u1",
  "tenants/north/supportTickets/s1"])batch.delete(doc(owner,p));
 await assertSucceeds(batch.commit());
});

test("owner can directly finalize their own draft without a second reviewer using linked revision and audit",async()=>{
 await env.withSecurityRulesDisabled(async c=>{
  await setDoc(doc(c.firestore(),"tenants","north","payrollRuns","owner-test"),{
   periodStart:"2026-10-01",periodEnd:"2026-10-14",payDate:"2026-10-16",
   status:"draft",submittedBy:"",approvedBy:"",finalizedBy:"",createdBy:"owner"
  });
 });
 const db=as("owner");
 const run=doc(db,"tenants","north","payrollRuns","owner-test");
 const before=(await getDoc(run)).data();
 const id="owner-direct-signoff";
 const after={...before,status:"finalized",submittedBy:"owner",approvedBy:"owner",
  finalizedBy:"owner",lastRevisionId:id,lastCorrectedBy:"owner",lastCorrectedAt:serverTimestamp()};
 const batch=writeBatch(db);
 batch.set(doc(db,"tenants","north","payrollRuns","owner-test","revisions",id),{
  kind:"period",entityId:"owner-test",
  reason:"Authorized owner second-party override on fictional payroll run",
  actor:"owner",at:serverTimestamp(),before,after});
 batch.update(run,after);
 batch.set(doc(db,"tenants","north","ownerAudit","owner-test-audit"),{
  action:"override approval",entityType:"payrollRuns",entityId:"owner-test",
  reason:"Authorized owner second-party override on fictional payroll run",
  actor:"owner",at:serverTimestamp(),before
 });
 await assertSucceeds(batch.commit());
 const result=await getDoc(run);
 assert.equal(result.data().status,"finalized");
 assert.equal(result.data().approvedBy,"owner");
 assert.equal(result.data().finalizedBy,"owner");
 await assertSucceeds(getDoc(doc(db,"tenants","north","payrollRuns","owner-test","revisions",id)));
});
test("owner can approve their own time, corrections and leave while viewers cannot",async()=>{
 await env.withSecurityRulesDisabled(async c=>{
  const d=c.firestore(),base="tenants/north/";
  await setDoc(doc(d,base+"timeEntries/t-self"),{createdBy:"owner",status:"pending",approvedBy:"",employeeId:"e1"});
  await setDoc(doc(d,base+"timeCorrections/c-self"),{createdBy:"owner",status:"pending",reviewedBy:"",timeEntryId:"t-self"});
  await setDoc(doc(d,base+"leaveRequests/l-self"),{createdBy:"owner",status:"pending",reviewedBy:"",employeeId:"e1"});
 });
 const owner=as("owner"),viewer=as("viewer");
 for(const [name,id,field] of [["timeEntries","t-self","approvedBy"],["timeCorrections","c-self","reviewedBy"],["leaveRequests","l-self","reviewedBy"]]){
  const path="tenants/north/"+name+"/"+id;
  await assertFails(updateDoc(doc(viewer,path),{status:"approved",[field]:"viewer"}));
  await assertSucceeds(updateDoc(doc(owner,path),{status:"approved",[field]:"owner"}));
  assert.equal((await getDoc(doc(owner,path))).data().status,"approved");
 }
});

test("ordinary client admin cannot use the owner exception to approve their own work",async()=>{
 await env.withSecurityRulesDisabled(async c=>{
  const d=c.firestore();
  await setDoc(doc(d,"tenants","north","payrollRuns","self-submit"),{
   status:"submitted",periodStart:"2026-10-01",periodEnd:"2026-10-14",payDate:"2026-10-16",
   createdBy:"admin",submittedBy:"admin",approvedBy:"",finalizedBy:""
  });
  await setDoc(doc(d,"tenants","north","timeEntries","admin-self"),{
   status:"pending",createdBy:"admin",employeeId:"e1",approvedBy:""
  });
 });
 const admin=as("admin");
 await assertFails(updateDoc(doc(admin,"tenants","north","payrollRuns","self-submit"),
  {status:"approved",approvedBy:"admin"}));
 await assertFails(updateDoc(doc(admin,"tenants","north","timeEntries","admin-self"),
  {status:"approved",approvedBy:"admin"}));
});

test("owner deletion receipt is protected and progresses without allowing client modification",async()=>{
 const owner=as("owner"),viewer=as("viewer");
 const receipt=doc(owner,"deletionReceipts","receipt-test");
 const data={kind:"payrollRuns",tenantId:"north",recordPath:"tenants/north/payrollRuns/p1",
  actor:"owner",reason:"Owner permanently removed fictional payroll data",status:"running",planned:3,completed:0,
  createdAt:serverTimestamp(),updatedAt:serverTimestamp()};
 await assertFails(setDoc(doc(viewer,"deletionReceipts","forged"),{...data,actor:"viewer"}));
 await assertSucceeds(setDoc(receipt,data));
 await assertFails(getDoc(doc(viewer,"deletionReceipts","receipt-test")));
 await assertSucceeds(updateDoc(receipt,{completed:2,updatedAt:serverTimestamp()}));
 await assertSucceeds(updateDoc(receipt,{completed:3,status:"completed",updatedAt:serverTimestamp()}));
 await assertFails(deleteDoc(receipt));
 assert.equal((await getDoc(receipt)).data().completed,3);
});
test("owner can delete linked employee conversations and company membership; viewer remains restricted",async()=>{
 await env.withSecurityRulesDisabled(async c=>{
  const db=c.firestore();
  await setDoc(doc(db,"tenants","north","employeeConversations","employee"),{kind:"private"});
  await setDoc(doc(db,"tenants","north","employeeConversations","employee","messages","m1"),{body:"Fictional private message"});
  await setDoc(doc(db,"userTenants","employee","items","north"),{tenantId:"north"});
 });
 const owner=as("owner"),viewer=as("viewer");
 await assertFails(deleteDoc(doc(viewer,"tenants","north","employeeConversations","employee","messages","m1")));
 const batch=writeBatch(owner);
 for(const path of [
  "tenants/north/employeeConversations/employee/messages/m1",
  "tenants/north/employeeConversations/employee",
  "tenants/north/employeeLinks/employee",
  "tenants/north/members/employee",
  "userTenants/employee/items/north"
 ])batch.delete(doc(owner,path));
 await assertSucceeds(batch.commit());
});
test("owner may remove complete fictional tenant tree but client viewers cannot",async()=>{
 await env.withSecurityRulesDisabled(async c=>{
  const db=c.firestore();
  await setDoc(doc(db,"tenants","south","announcements","example"),{title:"Roleplay"});
 });
 const viewer=as("viewer"),owner=as("owner");
 await assertFails(deleteDoc(doc(viewer,"tenants","south")));
 const batch=writeBatch(owner);
 batch.delete(doc(owner,"tenants","south","announcements","example"));
 batch.delete(doc(owner,"tenants","south"));
 await assertSucceeds(batch.commit());
 assert.equal((await getDoc(doc(owner,"tenants","south"))).exists(),false);
});

test("commissions are off by default, enabled per client and never readable by viewers or employees",async()=>{
 const owner=as("owner"),admin=as("admin"),viewer=as("viewer"),employee=as("employee");
 const base="tenants/north/";
 await assertFails(getDocs(collection(viewer,base+"commissionPlans")));
 await assertFails(getDocs(collection(employee,base+"commissionSales")));
 await assertFails(setDoc(doc(viewer,base+"commissionSettings/current"),{
  enabled:true,updatedBy:"viewer",updatedAt:serverTimestamp()}));
 await assertSucceeds(setDoc(doc(admin,base+"commissionSettings/current"),{
  enabled:true,updatedBy:"admin",updatedAt:serverTimestamp()}));
 await assertSucceeds(getDoc(doc(owner,base+"commissionSettings/current")));
 await assertFails(getDoc(doc(viewer,base+"commissionSettings/current")));
 await assertFails(getDoc(doc(employee,"tenants/south/commissionSettings/current")));
});
test("commission plans validate percentage and fixed settings; sale amount must match snapshotted plan",async()=>{
 const db=as("admin"),owner=as("owner"),viewer=as("viewer");
 const base="tenants/north/";
 await assertSucceeds(setDoc(doc(db,base+"commissionSettings/current"),{enabled:true,updatedBy:"admin",updatedAt:serverTimestamp()}));
 const plan={employeeId:"e1",type:"percent",rateBasisPoints:1250,fixedCents:0,active:true,updatedBy:"admin",updatedAt:serverTimestamp()};
 await assertSucceeds(setDoc(doc(db,base+"commissionPlans/e1"),plan));
 await assertFails(setDoc(doc(viewer,base+"commissionPlans/e2"),{...plan,employeeId:"e2",updatedBy:"viewer"}));
 const sale={employeeId:"e1",saleDate:"2026-10-12",description:"Fictional product sale",
  saleAmountCents:20000,commissionCents:2500,type:"percent",rateBasisPoints:1250,fixedCents:0,
  status:"pending",approvedBy:"",paidRunId:"",createdBy:"admin",createdAt:serverTimestamp()};
 await assertFails(setDoc(doc(db,base+"commissionSales/forged"),{...sale,commissionCents:9999}));
 await assertSucceeds(setDoc(doc(db,base+"commissionSales/ok"),sale));
 await assertFails(updateDoc(doc(db,base+"commissionSales/ok"),{status:"approved",approvedBy:"admin",reviewedAt:serverTimestamp()}));
 await assertSucceeds(updateDoc(doc(owner,base+"commissionSales/ok"),{status:"approved",approvedBy:"owner",reviewedAt:serverTimestamp()}));
 await assertFails(updateDoc(doc(viewer,base+"commissionSales/ok"),{paidRunId:"p1"}));
 const fixed={employeeId:"e2",type:"fixed",rateBasisPoints:0,fixedCents:1500,active:true,updatedBy:"admin",updatedAt:serverTimestamp()};
 await assertSucceeds(setDoc(doc(db,base+"commissionPlans/e2"),fixed));
 await assertSucceeds(setDoc(doc(db,base+"commissionSales/fixed"),{...sale,employeeId:"e2",type:"fixed",rateBasisPoints:0,fixedCents:1500,
  commissionCents:1500,createdBy:"admin"}));
 await assertFails(setDoc(doc(db,base+"commissionSales/badfixed"),{...sale,employeeId:"e2",type:"fixed",rateBasisPoints:0,fixedCents:1500,
  commissionCents:2500,createdBy:"admin"}));
});
test("only approved commission sales can be claimed by a draft payroll, and not twice",async()=>{
 const owner=as("owner"),admin=as("admin"),base="tenants/north/";
 await env.withSecurityRulesDisabled(async c=>{
  const db=c.firestore();
  await setDoc(doc(db,base+"commissionSales/approved"),{employeeId:"e1",saleDate:"2026-10-12",
   description:"Mock approved commission",saleAmountCents:40000,commissionCents:4000,type:"percent",rateBasisPoints:1000,
   fixedCents:0,status:"approved",approvedBy:"owner",paidRunId:"",createdBy:"admin"});
  await setDoc(doc(db,base+"payrollRuns/draft-run"),{periodStart:"2026-10-01",periodEnd:"2026-10-14",payDate:"2026-10-17",
   status:"draft",submittedBy:"",approvedBy:"",finalizedBy:"",createdBy:"admin"});
  await setDoc(doc(db,base+"payrollRuns/second-run"),{periodStart:"2026-10-01",periodEnd:"2026-10-14",payDate:"2026-10-17",
   status:"draft",submittedBy:"",approvedBy:"",finalizedBy:"",createdBy:"admin"});
 });
 await assertSucceeds(updateDoc(doc(admin,base+"commissionSales/approved"),{paidRunId:"draft-run"}));
 await assertFails(updateDoc(doc(admin,base+"commissionSales/approved"),{paidRunId:"second-run"}));
 await assertSucceeds(updateDoc(doc(owner,base+"commissionSales/approved"),{paidRunId:""}));
 await assertSucceeds(updateDoc(doc(admin,base+"commissionSales/approved"),{paidRunId:"second-run"}));
});
test("owner can delete approved fictional commission records but client users cannot",async()=>{
 await env.withSecurityRulesDisabled(async c=>{
  await setDoc(doc(c.firestore(),"tenants","north","commissionSales","doomed"),{employeeId:"e1",status:"approved",paidRunId:"",commissionCents:100});
 });
 await assertFails(deleteDoc(doc(as("viewer"),"tenants","north","commissionSales","doomed")));
 await assertFails(deleteDoc(doc(as("admin"),"tenants","north","commissionSales","doomed")));
 await assertSucceeds(deleteDoc(doc(as("owner"),"tenants","north","commissionSales","doomed")));
});
