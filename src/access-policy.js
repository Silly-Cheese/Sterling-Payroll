// Sterling-to-client permissions. A company administrator is not a Sterling
// administrator. Always enforce the same boundaries in Firestore rules.
export function serviceCapabilities(state = {}) {
 const sterlingManager = Boolean(state.platformOwner || state.platformWrite);
 const supportAgent = sterlingManager || state.platformRole === "support";
 const companyMember = Boolean(state.user && state.tenantId &&
  (supportAgent || ["client_admin","payroll_specialist","viewer"].includes(state.role)));
 return Object.freeze({
  billingWrite: sterlingManager,
  supportManage: supportAgent,
  supportInternal: supportAgent,
  companyAccessWrite: sterlingManager,
  caseCreate: companyMember,
  caseReply: companyMember,
  allCompanyCases: supportAgent,
  invoiceRead: companyMember,
  canRequestUrgent: supportAgent
 });
}

export function supportTicketVisibility(state, ticket) {
 const p=serviceCapabilities(state);
 return Boolean(p.caseCreate && ticket &&
  (p.allCompanyCases || ticket.createdBy === state.user?.uid));
}
