import {toCents,hoursValue} from "./payroll-core.js";
export function correctedLine(previous,input){
 if(!previous||!previous.employeeId)throw Error("Select a payroll line first");
 const regularCents=toCents(input.regular),overtimeCents=toCents(input.overtime);
 const bonusCents=toCents(input.bonus),deductionCents=toCents(input.deduction);
 const grossCents=regularCents+overtimeCents+bonusCents;
 if(grossCents>1000000000||deductionCents>grossCents)throw Error("Invalid revised fictional gross or deductions");
 return {...previous,regularCents,overtimeCents,bonusCents,deductionCents,grossCents,
  netCents:grossCents-deductionCents,
  regularHours:hoursValue(input.regularHours),overtimeHours:hoursValue(input.overtimeHours)};
}
export function correctedPeriod(previous,input){
 if(!previous||!previous.periodStart)throw Error("Choose a payroll period");
 const {periodStart,periodEnd,payDate,status}=input;
 const iso=/^\d{4}-\d{2}-\d{2}$/;
 if(![periodStart,periodEnd,payDate].every(v=>iso.test(v))||periodStart>periodEnd||periodEnd>payDate)throw Error("Period dates must be valid and ordered");
 if(!["draft","submitted","approved","finalized","rejected","voided"].includes(status))throw Error("Invalid payroll status");
 return {...previous,periodStart,periodEnd,payDate,status};
}
export function reason(value){
 const text=String(value||"").trim();
 if(text.length<10||text.length>500)throw Error("Provide an audit reason between 10 and 500 characters");
 return text;
}
export function canHardDelete(kind,hasChildren){
 if(["payrollRuns","tenants"].includes(kind))return !hasChildren;
 return ["employees","timeEntries","timeCorrections","leaveRequests","announcements","supportTickets","billingInvoices"].includes(kind);
}
export const REVIEW_STATES=Object.freeze({
 payrollRuns:["draft","submitted","approved","rejected","finalized"],
 timeEntries:["pending","approved","rejected"],
 timeCorrections:["pending","approved","rejected"],
 leaveRequests:["pending","approved","rejected"]
});
export function ownerApprovalOverride(kind,previous,status,ownerUid){
 const allowed=REVIEW_STATES[kind];
 if(!allowed||!allowed.includes(status)||!ownerUid)throw Error("Unsupported owner approval override");
 if(!previous||!previous.status)throw Error("Reload the record before overriding its approval");
 if(kind!=="payrollRuns"){
  const field=kind==="timeEntries"?"approvedBy":"reviewedBy";
  return {...previous,status,[field]:status==="pending"?"":ownerUid};
 }
 const draft={...previous,status};
 // An owner's explicit override is a documented exception to normal two-party signoff.
 // Preserve earlier participants when possible; attribute each newly bypassed step to the owner.
 if(status==="draft"){
  draft.submittedBy="";draft.approvedBy="";draft.finalizedBy="";
 }else if(status==="submitted"){
  draft.submittedBy=ownerUid;draft.approvedBy="";draft.finalizedBy="";
 }else if(status==="rejected"){
  draft.submittedBy=previous.submittedBy||ownerUid;
  draft.approvedBy=ownerUid;draft.finalizedBy="";
 }else if(status==="approved"){
  draft.submittedBy=previous.submittedBy||ownerUid;
  draft.approvedBy=ownerUid;draft.finalizedBy="";
 }else if(status==="finalized"){
  draft.submittedBy=previous.submittedBy||ownerUid;
  draft.approvedBy=previous.approvedBy||ownerUid;
  draft.finalizedBy=ownerUid;
 }
 return draft;
}
