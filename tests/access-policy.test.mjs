import test from "node:test";
import assert from "node:assert/strict";
import {serviceCapabilities,supportTicketVisibility} from "../src/access-policy.js";
const account={user:{uid:"client"},tenantId:"company"};
test("client company admin can manage payroll, not Sterling billing, support staffing or access",()=>{
 const cap=serviceCapabilities({...account,role:"client_admin"});
 assert.equal(cap.billingWrite,false);
 assert.equal(cap.supportManage,false);
 assert.equal(cap.supportInternal,false);
 assert.equal(cap.companyAccessWrite,false);
 assert.equal(cap.allCompanyCases,true);
 assert.equal(cap.caseCreate,true);
});
test("read-only client users can write only their own support conversation",()=>{
 const state={...account,role:"viewer"};
 const caps=serviceCapabilities(state);
 assert.equal(caps.caseCreate,true);
 assert.equal(caps.allCompanyCases,false);
 assert.equal(supportTicketVisibility(state,{createdBy:"client"}),true);
 assert.equal(supportTicketVisibility(state,{createdBy:"another"}),false);
});
test("Sterling support can operate cases but not change billing",()=>{
 const caps=serviceCapabilities({...account,platformRole:"support"});
 assert.equal(caps.supportManage,true);
 assert.equal(caps.billingWrite,false);
});
test("Sterling owner and administrator retain service administration",()=>{
 for(const config of [{platformOwner:true},{platformWrite:true}]){
  const caps=serviceCapabilities({...account,...config});
  assert.equal(caps.billingWrite,true);
  assert.equal(caps.supportManage,true);
  assert.equal(caps.companyAccessWrite,true);
 }
});
test("employees without company staff access cannot use client case administration",()=>{
 const cap=serviceCapabilities({...account,role:"employee"});
 assert.equal(cap.caseCreate,false);
 assert.equal(cap.billingWrite,false);
 assert.equal(cap.supportManage,false);
});
