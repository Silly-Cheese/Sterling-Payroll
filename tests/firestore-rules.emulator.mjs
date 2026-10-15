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
