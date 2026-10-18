// Timekeeping display logic. Totals are based on recorded hours, not payroll wages.
// Pending time is included in recorded totals but shown separately from approved time.
export const TIME_SORTS = Object.freeze(["date-desc","date-asc","employee-asc","employee-desc"]);
export const TIME_STATUSES = Object.freeze(["all","pending","approved","rejected"]);
const hundredths = number => Math.round(Number(number || 0) * 100);
const hours = hundredthsValue => hundredthsValue / 100;
export const formatHours = value => hours(hundredths(value)).toLocaleString("en-US", {
 minimumFractionDigits: 0, maximumFractionDigits: 2
});
export function sumTimecardHours(entries) {
 const total = {regular:0,overtime:0,total:0,approved:0,pending:0,rejected:0,
  approvedCount:0,pendingCount:0,rejectedCount:0,recordCount:0};
 for (const entry of entries) {
  const regular = hundredths(entry.regularHours), overtime = hundredths(entry.overtimeHours);
  if (!Number.isSafeInteger(regular) || !Number.isSafeInteger(overtime) ||
   regular < 0 || overtime < 0) throw Error("Invalid timecard hours");
  const sum = regular + overtime, status = entry.status || "pending";
  if (status === "rejected") {
   total.rejected += sum; total.rejectedCount++; continue;
  }
  total.regular += regular;total.overtime += overtime;total.total += sum;total.recordCount++;
  if (status === "approved") {total.approved += sum;total.approvedCount++}
  else {total.pending += sum;total.pendingCount++}
 }
 return Object.fromEntries(Object.entries(total).map(([k,v])=>
  k.endsWith("Count") || k === "recordCount" ? [k,v] : [k,hours(v)]));
}
export function filterTimecards(entries,{employeeId="",start="",end="",day="",status="all",search="",sort="date-desc"}={},
 employeeNames = new Map()) {
 const q=String(search).toLocaleLowerCase("en-US").trim();
 const rows=entries.filter(entry=>
  (!employeeId||entry.employeeId===employeeId) &&
  (!start||entry.workDate>=start) && (!end||entry.workDate<=end) &&
  (!day||entry.workDate===day) &&
  (status==="all"||(entry.status||"pending")===status) &&
  (!q||[employeeNames.get(entry.employeeId),entry.workDate,entry.note]
   .some(value=>String(value||"").toLocaleLowerCase("en-US").includes(q)))
 );
 const nameOf=entry=>String(employeeNames.get(entry.employeeId)||"Former employee");
 const tie=(a,b)=>String(a.id).localeCompare(String(b.id));
 return rows.sort((a,b)=>{
  if(sort==="date-asc")return a.workDate.localeCompare(b.workDate)||nameOf(a).localeCompare(nameOf(b))||tie(a,b);
  if(sort==="employee-asc")return nameOf(a).localeCompare(nameOf(b))||b.workDate.localeCompare(a.workDate)||tie(a,b);
  if(sort==="employee-desc")return nameOf(b).localeCompare(nameOf(a))||b.workDate.localeCompare(a.workDate)||tie(a,b);
  return b.workDate.localeCompare(a.workDate)||nameOf(a).localeCompare(nameOf(b))||tie(a,b);
 });
}
export function payPeriodForSelection(runs,value) {
 if(value==="all")return {start:"",end:"",label:"All dates"};
 if(value==="custom")return null;
 const period=runs.find(x=>x.id===value);
 if(!period)return null;
 return {start:period.periodStart,end:period.periodEnd,label:period.periodStart+" – "+period.periodEnd};
}


// Match the payroll preview's correction precedence. Never silently count
// original hours once an approved correction supersedes them.
export function applyApprovedTimeCorrections(entries, corrections = []) {
 const approved = new Map();
 for (const correction of corrections) {
  if (correction.status !== "approved") continue;
  const list = approved.get(correction.timeEntryId) || [];
  list.push(correction);
  approved.set(correction.timeEntryId,list);
 }
 return entries.map(entry=>{
  const matches = approved.get(entry.id) || [];
  if(matches.length > 1)
   throw Error("More than one approved correction exists for timecard "+entry.id+". Resolve the conflict before calculating period totals.");
  if(!matches.length)return entry;
  return {...entry,originalRegularHours:entry.regularHours,
   originalOvertimeHours:entry.overtimeHours,
   regularHours:matches[0].regularHours,overtimeHours:matches[0].overtimeHours,
   corrected:true};
 });
}
