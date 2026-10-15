// Owner-only destructive operations remain scoped to the selected Sterling Payroll company.
export const CASCADE_COLLECTIONS=Object.freeze({payrollRuns:["lines","snapshots","revisions"],billingInvoices:["events"],supportTickets:["updates","internalNotes"]});
export const DELETE_CONFIRMATION="DELETE PERMANENTLY";
export function describeCascade(kind,count){return "Permanently delete "+count+" selected and related "+kind+" records. This cannot be undone."}
export function requireConfirmation(phrase,reason){if(phrase!==DELETE_CONFIRMATION)throw Error("Type DELETE PERMANENTLY to confirm.");if(typeof reason!=="string"||reason.trim().length<10)throw Error("Please explain the deletion in at least 10 characters.");return reason.trim()}
