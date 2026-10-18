// Exhaust pagination before producing payroll numbers. A list reaching its
// page-size limit is NOT proof that more records exist: fetch the next page.
export async function readCompletePages(fetchPage, {
 pageSize = 200, maxPages = 2000, checkAccess = () => {}, onProgress = () => {}
} = {}) {
 if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 500)
  throw Error("Invalid payroll page size.");
 if (!Number.isInteger(maxPages) || maxPages < 1)
  throw Error("Invalid payroll page limit.");
 const records = [], seen = new Set();
 let cursor = null;
 for (let page = 0; page < maxPages; page++) {
  checkAccess();
  const result = await fetchPage(cursor, pageSize);
  checkAccess();
  const items = result?.records;
  if (!Array.isArray(items) || items.length > pageSize)
   throw Error("A payroll data page was incomplete or invalid.");
  for (const item of items) {
   if (!item || typeof item.id !== "string" || !item.id || seen.has(item.id))
    throw Error("Payroll data changed or contained duplicate records; retry.");
   seen.add(item.id);
   records.push(item);
  }
  onProgress({page: page + 1, count: records.length, complete: items.length < pageSize});
  if (items.length < pageSize) return records;
  if (!result.nextCursor)
   throw Error("Payroll data paging cursor was missing; cannot calculate safely.");
  cursor = result.nextCursor;
 }
 throw Error("Payroll data exceeds the supported review size. Contact Sterling support.");
}
