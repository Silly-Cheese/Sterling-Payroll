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
test("internal Sterling support notes are hidden even from client administrators",async()=>{
 for(const uid of ["viewer","admin"]){
  await assertFails(getDoc(doc(as(uid),"tenants","north","supportTickets","s1","internalNotes","n1")));
 }
 await assertSucceeds(getDoc(doc(as("owner"),"tenants","north","supportTickets","s1","internalNotes","n1")));
});
test("company administrators cannot alter Sterling invoice status or ledger",async()=>{
 const a=as("admin"),v=as("viewer"),o=as("owner");
 await assertFails(updateDoc(doc(a,"tenants","north","billingInvoices","i1"),{status:"issued",updatedAt:serverTimestamp()}));
 await assertFails(setDoc(doc(a,"tenants","north","billingInvoices","i1","events","ev"),{type:"payment",amountCents:100,note:"fake payment",createdBy:"admin",createdAt:serverTimestamp()}));
 await assertFails(setDoc(doc(v,"tenants","north","billingInvoices","i1","events","ev"),{type:"payment",amountCents:100,note:"fake entry",createdBy:"viewer",createdAt:serverTimestamp()}));
 await assertFails(updateDoc(doc(o,"tenants","north","billingInvoices","i1"),{status:"settled",updatedAt:serverTimestamp()}));
 await assertSucceeds(updateDoc(doc(o,"tenants","north","billingInvoices","i1"),{status:"issued",updatedAt:serverTimestamp()}));
 await assertSucceeds(setDoc(doc(o,"tenants","north","billingInvoices","i1","events","ev"),{type:"payment",amountCents:100,note:"Simulated payment",createdBy:"owner",createdAt:serverTimestamp()}));
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


test("only Sterling owner can delete commission assignments without removing historical sales or pay lines",async()=>{
 const base="tenants/north/";
 await env.withSecurityRulesDisabled(async context=>{
  const db=context.firestore();
  await setDoc(doc(db,base+"commissionPlans/e1"),{
   employeeId:"e1",type:"percent",rateBasisPoints:2500,fixedCents:0,
   active:true,updatedBy:"admin"
  });
  await setDoc(doc(db,base+"commissionSales/history-one"),{
   employeeId:"e1",saleDate:"2026-10-12",description:"Historical sale",
   saleAmountCents:40000,commissionCents:10000,type:"percent",
   rateBasisPoints:2500,fixedCents:0,status:"approved",
   approvedBy:"owner",paidRunId:"p1",createdBy:"admin"
  });
 });
 const assignment=doc(as("owner"),base+"commissionPlans/e1");
 await assertFails(deleteDoc(doc(as("viewer"),base+"commissionPlans/e1")));
 await assertFails(deleteDoc(doc(as("admin"),base+"commissionPlans/e1")));
 await assertSucceeds(deleteDoc(assignment));
 assert.equal((await getDoc(assignment)).exists(),false);
 const history=await getDoc(doc(as("owner"),base+"commissionSales/history-one"));
 assert.equal(history.exists(),true);
 assert.equal(history.data().commissionCents,10000);
 assert.equal(history.data().paidRunId,"p1");
 const finalized=await getDoc(doc(as("owner"),base+"payrollRuns/p1/lines/e1"));
 assert.equal(finalized.exists(),true);
});


test("commission claims cannot target timecard-only or out-of-period runs",async()=>{
 const base="tenants/north/";
 await env.withSecurityRulesDisabled(async c=>{
  const db=c.firestore();
  for(const [id,mode] of [["time-only","timecards-only"],["commission","commissions-only"]])
   await setDoc(doc(db,base+"payrollRuns/"+id),{
    processingMode:mode,status:"draft",periodStart:"2026-10-01",
    periodEnd:"2026-10-31",payDate:"2026-11-01",createdBy:"admin"
   });
  for(const [id,date] of [["in-period","2026-10-17"],["outside","2026-09-30"]])
   await setDoc(doc(db,base+"commissionSales/"+id),{
    employeeId:"e1",saleDate:date,status:"approved",paidRunId:"",
    commissionCents:10000,approvedBy:"owner",createdBy:"admin"
   });
 });
 const admin=as("admin");
 await assertFails(updateDoc(doc(admin,base+"commissionSales/in-period"),{paidRunId:"time-only"}));
 await assertFails(updateDoc(doc(admin,base+"commissionSales/outside"),{paidRunId:"commission"}));
 await assertSucceeds(updateDoc(doc(admin,base+"commissionSales/in-period"),{paidRunId:"commission"}));
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

test("named payroll drafts accept each processing mode while rejecting unknown ones",async()=>{
 const db=as("admin"),base="tenants/north/payrollRuns/";
 const draft={periodStart:"2026-10-12",periodEnd:"2026-10-18",payDate:"2026-10-19",
  status:"draft",createdAt:serverTimestamp(),createdBy:"admin",
  submittedBy:"",approvedBy:"",finalizedBy:""};
 for(const mode of ["combined","timecards-only","commissions-only"]){
  await assertSucceeds(setDoc(doc(db,base+"run-"+mode),{...draft,name:"October "+mode,processingMode:mode}));
 }
 await assertFails(setDoc(doc(db,base+"bad-mode"),{...draft,processingMode:"invalid"}));
 await assertFails(setDoc(doc(db,base+"bad-name"),{...draft,name:"X".repeat(81),processingMode:"combined"}));
});


test("new operations documents respect tenant roles and immutable compensation history",async()=>{
 const root="tenants/north/";
 await env.withSecurityRulesDisabled(async c=>{
  await setDoc(doc(c.firestore(),root+"employees/e1"),{
   displayName:"Employee One",status:"active",payType:"hourly",
   hourlyRateCents:2500,annualSalaryCents:0
  });
 });
 const profile={employeeId:"e1",effectiveDate:"2026-10-01",payType:"hourly",
  hourlyRateCents:2500,taxRateBasisPoints:1500,recurringDeductionCents:1500,
  note:"Effective-dated rate",createdBy:"admin",createdAt:serverTimestamp()};
 const ref=root+"compensationChanges/e1_2026-10-01";
 await assertFails(setDoc(doc(as("viewer"),ref),{...profile,createdBy:"viewer"}));
 await assertSucceeds(setDoc(doc(as("admin"),ref),profile));
 await assertFails(updateDoc(doc(as("admin"),ref),{hourlyRateCents:2600}));
 await assertFails(setDoc(doc(as("admin"),"tenants/south/compensationChanges/e1_2026-10-01"),profile));
 const schedule={name:"Monthly payroll",cadence:"monthly",processingMode:"commissions-only",
  nextStart:"2026-10-01",payDelay:2,active:true,
  createdBy:"admin",createdAt:serverTimestamp(),updatedAt:serverTimestamp()};
 await assertFails(setDoc(doc(as("viewer"),root+"payCycleSchedules/october"),{...schedule,createdBy:"viewer"}));
 await assertSucceeds(setDoc(doc(as("admin"),root+"payCycleSchedules/october"),schedule));
 await assertFails(updateDoc(doc(as("viewer"),root+"payCycleSchedules/october"),{active:false}));
});
test("pay policy tax percentage and payroll generation audit are guarded",async()=>{
 const policy="tenants/north/payrollPolicies/current";
 await assertFails(setDoc(doc(as("viewer"),policy),{
  version:2,overtimeMultiplierHundredths:150,defaultBonusCents:0,
  defaultDeductionCents:0,defaultTaxRateBasisPoints:1250,requireApprovedTime:true
 }));
 await assertSucceeds(setDoc(doc(as("admin"),policy),{
  version:2,overtimeMultiplierHundredths:150,defaultBonusCents:0,
  defaultDeductionCents:0,defaultTaxRateBasisPoints:1250,requireApprovedTime:true
 }));
 await assertFails(updateDoc(doc(as("admin"),policy),{version:3,defaultTaxRateBasisPoints:12500}));
 await assertSucceeds(setDoc(doc(as("admin"),"tenants/north/auditEvents/payroll-generate-test"),{
  category:"payroll",action:"payroll-generate",subject:"commission-only-batch",
  detail:"Test simulated pay lines",actor:"admin",at:serverTimestamp()
 }));
 await assertFails(setDoc(doc(as("viewer"),"tenants/north/auditEvents/fake-test"),{
  category:"payroll",action:"payroll-generate",subject:"commission-only-batch",
  detail:"Unauthorized audit",actor:"viewer",at:serverTimestamp()
 }));
});

test("real commission-only generation: six zero-wage pay lines followed by approved sale claims",async()=>{
 const base="tenants/north/",runId="commission-only-batch";
 await env.withSecurityRulesDisabled(async context=>{
  const db=context.firestore();
  await setDoc(doc(db,base+"payrollRuns/"+runId),{
   name:"October commissions",processingMode:"commissions-only",
   periodStart:"2026-10-01",periodEnd:"2026-10-31",payDate:"2026-10-31",
   status:"draft",createdBy:"admin",submittedBy:"",approvedBy:"",finalizedBy:""
  });
  for(let i=1;i<=6;i++){
   const id="sales-"+i;
   await setDoc(doc(db,base+"employees/"+id),{
    displayName:"Commission employee "+i,payType:"salary",status:"active",
    annualSalaryCents:9000000,payFrequency:"monthly"
   });
   await setDoc(doc(db,base+"commissionSales/"+id),{
    employeeId:id,saleDate:"2026-10-15",description:"Approved sample sale",
    saleAmountCents:120000,commissionCents:12000,type:"percent",rateBasisPoints:1000,fixedCents:0,
    status:"approved",approvedBy:"owner",paidRunId:"",createdBy:"admin"
   });
  }
 });
 const admin=as("admin"),lines=writeBatch(admin);
 for(let i=1;i<=6;i++){
  const id="sales-"+i;
  lines.set(doc(admin,base+"payrollRuns/"+runId+"/lines/"+id),{
   employeeId:id,employeeName:"Commission employee "+i,payType:"salary",
   regularHours:0,overtimeHours:0,paidLeaveHours:0,regularCents:0,overtimeCents:0,
   bonusCents:0,commissionCents:12000,grossCents:12000,
   taxRateBasisPoints:1250,taxCents:1500,otherDeductionCents:0,
   deductionCents:1500,netCents:10500,policyVersion:2
  });
 }
 await assertSucceeds(lines.commit());
 const claims=writeBatch(admin);
 for(let i=1;i<=6;i++)claims.update(doc(admin,base+"commissionSales/sales-"+i),{paidRunId:runId});
 await assertSucceeds(claims.commit());
 const owner=as("owner");
 await assertSucceeds(getDoc(doc(owner,base+"payrollRuns/"+runId+"/lines/sales-1")));
 await assertFails(setDoc(doc(as("viewer"),base+"payrollRuns/"+runId+"/lines/unauthorized"),{
  employeeId:"unauthorized",employeeName:"Unauthorized",payType:"salary",
  regularHours:0,overtimeHours:0,regularCents:0,overtimeCents:0,bonusCents:0,
  commissionCents:12000,deductionCents:0,grossCents:12000,netCents:12000
 }));
});
test("commission-only rules reject salary, leave, bonus and falsified simulated tax",async()=>{
 const path="tenants/north/payrollRuns/strict-commission";
 await env.withSecurityRulesDisabled(async c=>{
  await setDoc(doc(c.firestore(),path),{
   status:"draft",processingMode:"commissions-only",periodStart:"2026-10-01",
   periodEnd:"2026-10-31",payDate:"2026-10-31",createdBy:"admin"
  });
 });
 const admin=as("admin"),line={
  employeeId:"e1",employeeName:"Fictional Employee",payType:"hourly",
  regularHours:0,overtimeHours:0,paidLeaveHours:0,regularCents:0,overtimeCents:0,
  bonusCents:0,commissionCents:12000,grossCents:12000,
  taxRateBasisPoints:1250,taxCents:1500,otherDeductionCents:0,
  deductionCents:1500,netCents:10500,policyVersion:1
 };
 await assertSucceeds(setDoc(doc(admin,path+"/lines/e1"),line));
 for(const [label,patch] of [
  ["salary",{regularCents:1000,grossCents:13000,netCents:11500}],
  ["hours",{regularHours:1}],
  ["leave",{paidLeaveHours:2}],
  ["bonus",{bonusCents:100,grossCents:12100,netCents:10600}],
  ["tax",{taxCents:1000,deductionCents:1000,netCents:11000}]
 ]){
  await assertFails(setDoc(doc(admin,path+"/lines/e1"),{...line,...patch}),label);
 }
});

test("run processing mode controls payroll line earnings and cannot be modified afterward",async()=>{
 const admin=as("admin"),base="tenants/north/";
 await env.withSecurityRulesDisabled(async c=>{
  const db=c.firestore();
  for(const [id,mode] of [["co","commissions-only"],["tc","timecards-only"]])
   await setDoc(doc(db,base+"payrollRuns/"+id),{periodStart:"2026-10-12",periodEnd:"2026-10-18",payDate:"2026-10-19",
    status:"draft",processingMode:mode,createdBy:"admin",submittedBy:"",approvedBy:"",finalizedBy:""});
 });
 const line={employeeId:"e1",employeeName:"Fictional Employee",payType:"hourly",
  regularHours:0,overtimeHours:0,regularCents:0,overtimeCents:0,
  bonusCents:0,commissionCents:18000,deductionCents:0,grossCents:18000,netCents:18000,
  policyVersion:1,paidLeaveHours:0};
 await assertSucceeds(setDoc(doc(admin,base+"payrollRuns/co/lines/e1"),line));
 await assertFails(setDoc(doc(admin,base+"payrollRuns/co/lines/e2"),{
  ...line,employeeId:"e2",employeeName:"Other Person",regularHours:2,regularCents:5000,
  grossCents:23000,netCents:23000
 }));
 await assertFails(setDoc(doc(admin,base+"payrollRuns/tc/lines/e1"),line));
 await assertSucceeds(setDoc(doc(admin,base+"payrollRuns/tc/lines/e1"),{
  ...line,regularHours:2,regularCents:5000,commissionCents:0,grossCents:5000,netCents:5000
 }));
 await assertFails(updateDoc(doc(admin,base+"payrollRuns/co"),{processingMode:"combined"}));
});
test("draft payroll can be renamed; completed run can only be renamed by Sterling owner",async()=>{
 const base="tenants/north/payrollRuns/",admin=as("admin"),owner=as("owner");
 await env.withSecurityRulesDisabled(async c=>{
  await setDoc(doc(c.firestore(),base+"name-draft"),{status:"draft",createdBy:"admin",
   periodStart:"2026-10-12",periodEnd:"2026-10-18",payDate:"2026-10-19"});
  await setDoc(doc(c.firestore(),base+"name-final"),{status:"finalized",createdBy:"admin",
   periodStart:"2026-10-12",periodEnd:"2026-10-18",payDate:"2026-10-19",
   submittedBy:"admin",approvedBy:"owner",finalizedBy:"admin"});
 });
 await assertSucceeds(updateDoc(doc(admin,base+"name-draft"),{
  name:"October regular wages",nameUpdatedBy:"admin",nameUpdatedAt:serverTimestamp()
 }));
 await assertFails(updateDoc(doc(admin,base+"name-final"),{
  name:"My edit",nameUpdatedBy:"admin",nameUpdatedAt:serverTimestamp()
 }));
 await assertSucceeds(updateDoc(doc(owner,base+"name-final"),{
  name:"October finalized",nameUpdatedBy:"owner",nameUpdatedAt:serverTimestamp()
 }));
});

test("owner can delete approved fictional commission records but client users cannot",async()=>{
 await env.withSecurityRulesDisabled(async c=>{
  await setDoc(doc(c.firestore(),"tenants","north","commissionSales","doomed"),{employeeId:"e1",status:"approved",paidRunId:"",commissionCents:100});
 });
 await assertFails(deleteDoc(doc(as("viewer"),"tenants","north","commissionSales","doomed")));
 await assertFails(deleteDoc(doc(as("admin"),"tenants","north","commissionSales","doomed")));
 await assertSucceeds(deleteDoc(doc(as("owner"),"tenants","north","commissionSales","doomed")));
});


test("a 22-worker draft must be saved in security-budgeted chunks, not one large batch",async()=>{
 await env.withSecurityRulesDisabled(async c=>{
  const db=c.firestore(),prepare=writeBatch(db);
  prepare.set(doc(db,"tenants","north","payrollRuns","bulk22"),{
   status:"draft",periodStart:"2026-10-12",periodEnd:"2026-10-17",payDate:"2026-10-18",
   createdBy:"owner",submittedBy:"",approvedBy:"",finalizedBy:""
  });
  for(let i=0;i<22;i++)prepare.set(doc(db,"tenants","north","employees","bulk-e"+i),{
   displayName:"Test worker "+i,status:"active",payType:"hourly",hourlyRateCents:2000
  });
  await prepare.commit();
 });
 const db=as("owner");
 const line=i=>({
  employeeId:"bulk-e"+i,employeeName:"Test worker "+i,payType:"hourly",
  regularHours:1,overtimeHours:0,regularCents:2000,overtimeCents:0,
  bonusCents:0,deductionCents:0,grossCents:2000,netCents:2000,
  policyVersion:2,paidLeaveHours:0,commissionCents:0
 });
 const lineRef=i=>doc(db,"tenants","north","payrollRuns","bulk22","lines","bulk-e"+i);
 const oversized=writeBatch(db);
 for(let i=0;i<22;i++)oversized.set(lineRef(i),line(i));
 await assertFails(oversized.commit());
 for(let offset=0;offset<22;offset+=6){
  const chunk=writeBatch(db);
  for(let i=offset;i<Math.min(offset+6,22);i++)chunk.set(lineRef(i),line(i));
  await assertSucceeds(chunk.commit());
 }
 const snap=await getDocs(collection(db,"tenants","north","payrollRuns","bulk22","lines"));
 assert.equal(snap.size,22);
});


test("clients may not alter Sterling agreements, support assignment, or employee identity links",async()=>{
 const admin=as("admin"),owner=as("owner");
 await assertFails(setDoc(doc(admin,"tenants","north","serviceAgreements","current"),{
  tier:"starter",billingCycle:"monthly",status:"active",renewalDate:"",seatLimit:2,rateCents:4900,
  updatedBy:"admin",updatedAt:serverTimestamp()
 }));
 await assertSucceeds(setDoc(doc(owner,"tenants","north","serviceAgreements","current"),{
  tier:"starter",billingCycle:"monthly",status:"active",renewalDate:"",seatLimit:2,rateCents:4900,
  updatedBy:"owner",updatedAt:serverTimestamp()
 }));
 await assertFails(updateDoc(doc(admin,"tenants","north","supportTickets","s1"),{
  status:"closed",updatedAt:serverTimestamp()
 }));
 await assertSucceeds(updateDoc(doc(owner,"tenants","north","supportTickets","s1"),{
  status:"in_progress",updatedAt:serverTimestamp()
 }));
 await assertFails(setDoc(doc(admin,"tenants","north","employeeLinks","viewer"),{
  employeeId:"e1",linkedBy:"admin",linkedAt:serverTimestamp()
 }));
 await assertSucceeds(setDoc(doc(owner,"tenants","north","employeeLinks","viewer"),{
  employeeId:"e1",linkedBy:"owner",linkedAt:serverTimestamp()
 }));
});

test("each client account can read only its own case, including administrators",async()=>{
 const v=as("viewer"),a=as("admin"),o=as("owner");
 await env.withSecurityRulesDisabled(async context=>{
  const d=context.firestore();
  await setDoc(doc(d,"tenants","north","supportTickets","another-case"),{
   subject:"Another employee",details:"Private support note",status:"open",priority:"normal",category:"technical",
   createdBy:"admin",assignedUid:"",createdAt:serverTimestamp(),updatedAt:serverTimestamp()
  });
 });
 await assertFails(getDoc(doc(v,"tenants","north","supportTickets","another-case")));
 await assertSucceeds(getDoc(doc(a,"tenants","north","supportTickets","another-case")));
 await assertFails(getDoc(doc(a,"tenants","north","supportTickets","s1")));
 await assertSucceeds(getDoc(doc(o,"tenants","north","supportTickets","another-case")));
 const reply=doc(v,"tenants","north","supportTickets","another-case","updates","bad");
 await assertFails(setDoc(reply,{body:"I should not see or reply to this case",createdBy:"viewer",createdAt:serverTimestamp()}));
});

test("only Sterling can grant company membership",async()=>{
 const admin=as("admin"),owner=as("owner");
 const fields={email:"stranger@demo.invalid",role:"viewer",status:"active",joinedAt:serverTimestamp()};
 await assertFails(setDoc(doc(admin,"tenants","north","members","stranger"),fields));
 await assertSucceeds(setDoc(doc(owner,"tenants","north","members","stranger"),fields));
});

test("simulated tax policy accepts an authorized percentage and rejects rates over 100%",async()=>{
 const db=as("owner"),ref=doc(db,"tenants","north","payrollPolicies","current");
 const base={version:2,overtimeMultiplierHundredths:150,defaultBonusCents:0,defaultDeductionCents:200,
  defaultTaxRateBasisPoints:1250,requireApprovedTime:true};
 await assertFails(setDoc(ref,{...base,defaultTaxRateBasisPoints:10001}));
 await assertSucceeds(setDoc(ref,base));
 const updated={...base,version:3,defaultTaxRateBasisPoints:1500};
 await assertSucceeds(updateDoc(ref,updated));
 assert.equal((await getDoc(ref)).data().defaultTaxRateBasisPoints,1500);
});
test("tax details must reconcile with total deductions on draft pay lines",async()=>{
 await env.withSecurityRulesDisabled(async context=>{
  await setDoc(doc(context.firestore(),"tenants","north","payrollRuns","draft-tax"),{
   status:"draft",periodStart:"2026-10-12",periodEnd:"2026-10-17",payDate:"2026-10-18",createdBy:"owner"
  });
 });
 const db=as("owner"),path=doc(db,"tenants","north","payrollRuns","draft-tax","lines","e1");
 const line={employeeId:"e1",employeeName:"Fictional Employee",payType:"hourly",regularHours:10,overtimeHours:0,
  regularCents:20000,overtimeCents:0,bonusCents:0,commissionCents:0,
  taxRateBasisPoints:1250,taxCents:2500,otherDeductionCents:1000,
  deductionCents:3500,grossCents:20000,netCents:16500,policyVersion:2,paidLeaveHours:0};
 await assertFails(setDoc(path,{...line,otherDeductionCents:2000}));
 await assertFails(setDoc(path,{...line,taxRateBasisPoints:1500}));
 await assertSucceeds(setDoc(path,line));
 await assertFails(updateDoc(path,{taxRateBasisPoints:10001}));
 await assertSucceeds(updateDoc(path,{taxRateBasisPoints:1500,taxCents:3000,deductionCents:4000,netCents:16000}));
});


test("Operations Center schedules are tenant-scoped and use constrained payroll roles",async()=>{
 const s={name:"Biweekly payroll",cadence:"biweekly",processingMode:"combined",nextStart:"2026-10-19",
  payDelay:3,active:true,createdBy:"admin",createdAt:serverTimestamp(),updatedAt:serverTimestamp()};
 const path="tenants/north/payCycleSchedules/regular";
 await assertFails(setDoc(doc(as("viewer"),path),{...s,createdBy:"viewer"}));
 await assertFails(setDoc(doc(as("admin"),"tenants/south/payCycleSchedules/regular"),s));
 await assertSucceeds(setDoc(doc(as("admin"),path),s));
 await assertFails(updateDoc(doc(as("admin"),path),{payDelay:45}));
 await assertFails(updateDoc(doc(as("admin"),path),{nextStart:"2026-09-01",updatedBy:"admin",updatedAt:serverTimestamp()}));
 await assertSucceeds(updateDoc(doc(as("admin"),path),{nextStart:"2026-11-02",updatedBy:"admin",updatedAt:serverTimestamp()}));
});
test("Compensation profiles require valid rates and immutable history",async()=>{
 const path="tenants/north/compensationProfiles/e1";
 const profile={employeeId:"e1",effectiveFrom:"2026-10-19",taxRateBasisPoints:1250,
  recurringDeductionCents:500,updatedAt:serverTimestamp(),updatedBy:"admin"};
 await assertFails(setDoc(doc(as("viewer"),path),{...profile,updatedBy:"viewer"}));
 await assertFails(setDoc(doc(as("admin"),path),{...profile,taxRateBasisPoints:15000}));
 await assertSucceeds(setDoc(doc(as("admin"),path),profile));
 await assertSucceeds(setDoc(doc(as("admin"),"tenants/north/compensationHistory/history-01"),{
  employeeId:"e1",effectiveFrom:"2026-10-19",taxRateBasisPoints:1250,
  recurringDeductionCents:500,changedAt:serverTimestamp(),changedBy:"admin"
 }));
 await assertFails(updateDoc(doc(as("admin"),"tenants/north/compensationHistory/history-01"),{recurringDeductionCents:2000}));
 await assertFails(setDoc(doc(as("admin"),"tenants/south/compensationProfiles/e1"),profile));
});


test("Six commission-only pay lines and approved sale claim pass current Firestore rules",async()=>{
 const base="tenants/north/",runId="commission-october";
 await env.withSecurityRulesDisabled(async ctx=>{
  const db=ctx.firestore();
  await setDoc(doc(db,base+"payrollRuns/"+runId),{
   status:"draft",processingMode:"commissions-only",name:"October Commission Payout",
   periodStart:"2026-10-01",periodEnd:"2026-10-31",payDate:"2026-10-31",
   createdBy:"owner",submittedBy:"",approvedBy:"",finalizedBy:""
  });
  for(let i=1;i<=6;i++){
   const id="commission-e"+i;
   await setDoc(doc(db,base+"employees/"+id),{displayName:"Agent "+i,
    status:"active",payType:"salary",annualSalaryCents:8000000,payFrequency:"monthly"});
  }
  await setDoc(doc(db,base+"commissionSales/approved-october"),{
   employeeId:"commission-e1",saleDate:"2026-10-12",description:"Fictional sale",
   saleAmountCents:80000,commissionCents:20000,type:"percent",rateBasisPoints:2500,
   fixedCents:0,status:"approved",approvedBy:"admin",paidRunId:"",createdBy:"owner"
  });
 });
 const db=as("owner"),batch=writeBatch(db);
 for(let i=1;i<=6;i++){
  const id="commission-e"+i,comm=20000,tax=2500;
  batch.set(doc(db,base+"payrollRuns/"+runId+"/lines/"+id),{
   employeeId:id,employeeName:"Agent "+i,payType:"salary",
   regularHours:0,overtimeHours:0,paidLeaveHours:0,
   regularCents:0,overtimeCents:0,bonusCents:0,commissionCents:comm,
   grossCents:comm,taxRateBasisPoints:1250,taxCents:tax,
   otherDeductionCents:0,deductionCents:tax,netCents:comm-tax,policyVersion:1
  });
 }
 await assertSucceeds(batch.commit());
 const claim=writeBatch(db);
 claim.update(doc(db,base+"commissionSales/approved-october"),{paidRunId:runId});
 await assertSucceeds(claim.commit());
 const saved=await getDoc(doc(db,base+"payrollRuns/"+runId+"/lines/commission-e1"));
 assert.equal(saved.data().regularCents,0);
 assert.equal(saved.data().commissionCents,20000);
 assert.equal(saved.data().taxCents,2500);
 assert.equal(saved.data().netCents,17500);
});
