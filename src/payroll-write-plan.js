// Bound Firestore writes by security-rule document-access limits (20 per batch).
// Six mutations per transaction leaves room for tenant, owner, run and employee checks.
export const PAYROLL_SAFE_WRITE_SIZE = 6;

export function chunkPayrollWrites(items, size = PAYROLL_SAFE_WRITE_SIZE) {
 if (!Number.isInteger(size) || size < 1 || size > PAYROLL_SAFE_WRITE_SIZE)
  throw Error("Payroll write batch exceeds the approved security budget.");
 const chunks = [];
 for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
 return chunks;
}

export function planPayrollDraftWrites({lines, existingIds = [], claims = [], releases = []}) {
 if (!Array.isArray(lines) || !Array.isArray(existingIds) ||
  !Array.isArray(claims) || !Array.isArray(releases))
  throw Error("Invalid payroll draft data.");
 const validId = x => typeof x === "string" && x.length > 0 && x.length <= 128 && !x.includes("/");
 const lineIds = new Set();
 const mutations = [];
 for (const line of lines) {
  if (!validId(line?.employeeId) || lineIds.has(line.employeeId))
   throw Error("Payroll pay lines contain a duplicate or invalid employee.");
  lineIds.add(line.employeeId);
  mutations.push({type:"line",employeeId:line.employeeId,line});
 }
 const saleIds = new Set();
 for (const [kind, sales] of [["claim",claims],["release",releases]]) {
  for (const sale of sales) {
   if (!validId(sale?.id) || saleIds.has(sale.id))
    throw Error("A commission sale was duplicated or has no record ID.");
   saleIds.add(sale.id);
   mutations.push({type:kind,saleId:sale.id});
  }
 }
 const deleted = new Set();
 for (const id of existingIds) {
  if (!validId(id) || deleted.has(id)) throw Error("Invalid existing pay line.");
  deleted.add(id);
  if (!lineIds.has(id)) mutations.push({type:"delete",employeeId:id});
 }
 return chunkPayrollWrites(mutations);
}
