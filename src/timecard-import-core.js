// CSV-only, simulated client timecard import. No real payroll disbursement.
import {parseCsv} from "./phase2-core.js";
const aliases={
 employeeId:["employeeid","staffid","personnelid"],
 employeeName:["employeename","name","employee","fullname"],
 workDate:["workdate","date","shiftdate"],
 regularHours:["regularhours","regular","hours","regularhrs"],
 overtimeHours:["overtimehours","overtime","ot","othours"],
 note:["note","notes","memo","description"]
};
const normalize=s=>String(s??"").replace(/^\uFEFF/,"").toLowerCase().replace(/[^a-z0-9]/g,"");
const val=(row,position)=>position<0?"":String(row[position]??"").trim();
export function validWorkDate(value){
 const input=String(value??"").trim();
 let match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(input);
 let year,month,day;
 if(match){year=Number(match[1]);month=Number(match[2]);day=Number(match[3]);}
 else{
  match=/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(input);
  if(!match)throw Error("Use YYYY-MM-DD or MM/DD/YYYY dates.");
  year=Number(match[3]);month=Number(match[1]);day=Number(match[2]);
 }
 if(year<1900||year>2100||month<1||month>12||day<1||day>31||
  new Date(Date.UTC(year,month-1,day)).toISOString().slice(0,10)!==
   [year,String(month).padStart(2,"0"),String(day).padStart(2,"0")].join("-"))
  throw Error("Invalid calendar date.");
 return [year,String(month).padStart(2,"0"),String(day).padStart(2,"0")].join("-");
}
export function timecardHours(value){
 const raw=String(value??"").trim();
 if(!/^(?:\d{1,2}|\d{1,2}\.\d{1,2})$/.test(raw))throw Error("Hours must be a number with at most two decimals.");
 const number=Number(raw);
 if(!Number.isFinite(number)||number<0||number>24)throw Error("Hours must be between 0 and 24 per workday.");
 return number;
}
export function parseTimecardCsv(text){
 if(typeof text!=="string"||text.length>160000)throw Error("Timecard CSV is too large (160 KB maximum).");
 const rows=parseCsv(text);
 if(rows.length<2)throw Error("CSV must have headers and at least one timecard.");
 if(rows.length>101)throw Error("Import up to 100 timecards per batch.");
 const header=rows[0].map(normalize),positions={};
 for(const [field,headers] of Object.entries(aliases)){
  positions[field]=header.findIndex(h=>headers.includes(h));
 }
 if(positions.workDate<0||positions.regularHours<0||positions.overtimeHours<0||
  (positions.employeeId<0&&positions.employeeName<0))
  throw Error("Required columns: employeeId or employeeName, workDate, regularHours, overtimeHours.");
 const parsed=[];
 rows.slice(1).forEach((row,index)=>{
  const sourceLine=index+2,employeeId=val(row,positions.employeeId),employeeName=val(row,positions.employeeName),note=val(row,positions.note);
  const item={sourceLine,employeeId,employeeName,workDate:"",regularHours:0,overtimeHours:0,note,error:""};
  try{
   if(!employeeId&&!employeeName)throw Error("Employee ID or name is missing.");
   if(employeeId.length>128||employeeName.length>120)throw Error("Employee identifier is too long.");
   item.workDate=validWorkDate(val(row,positions.workDate));
   item.regularHours=timecardHours(val(row,positions.regularHours)||"0");
   item.overtimeHours=timecardHours(val(row,positions.overtimeHours)||"0");
   if(Math.round((item.regularHours+item.overtimeHours)*100)>2400)throw Error("Total hours cannot exceed 24 for a single workday.");
   if(item.regularHours+item.overtimeHours===0)throw Error("A timecard must contain working hours.");
   if(note.length>250)throw Error("Note exceeds 250 characters.");
  }catch(e){item.error=e.message}
  parsed.push(item);
 });
 return parsed;
}
export function normalizeEmployeeName(name){return String(name??"").trim().replace(/\s+/g," ").toLocaleLowerCase("en-US");}
export function matchTimecards(parsed,employees,existing=[]){
 const byId=new Map(employees.map(e=>[e.id,e]));
 const byName=new Map();
 for(const e of employees){
  const key=normalizeEmployeeName(e.displayName);
  if(!byName.has(key))byName.set(key,[]);
  byName.get(key).push(e);
 }
 const existingKeys=new Set(existing.map(e=>e.employeeId+"|"+e.workDate)),seen=new Set();
 return parsed.map(item=>{
  const row={...item,status:"ready",employee:null};
  if(row.error){row.status="invalid";return row}
  const matches=item.employeeId?[byId.get(item.employeeId)].filter(Boolean):(byName.get(normalizeEmployeeName(item.employeeName))||[]);
  if(matches.length===0){row.status="unmatched";row.error="No employee matches this "+(item.employeeId?"ID":"name")+" in the selected client company.";return row;}
  if(matches.length>1){row.status="ambiguous";row.error="Several employees share this name. Use employeeId instead.";return row;}
  const employee=matches[0];
  if(employee.status!=="active"){row.status="inactive";row.error="This employee is not active.";return row;}
  if(item.employeeId&&item.employeeName&&normalizeEmployeeName(employee.displayName)!==normalizeEmployeeName(item.employeeName)){
   row.status="mismatch";row.error="Employee name does not match the supplied ID.";return row;
  }
  row.employee=employee;
  const key=employee.id+"|"+item.workDate;
  if(seen.has(key)){row.status="duplicate";row.error="Another row in this CSV already has this employee and date.";return row}
  seen.add(key);
  if(existingKeys.has(key)){row.status="duplicate";row.error="A timecard already exists for this employee and date.";return row}
  return row;
 });
}
export const timecardCsvTemplate="employeeId,employeeName,workDate,regularHours,overtimeHours,note\n,Example Employee,2026-10-15,8,0,Example shift\n";
export function importDocumentId(employeeId,workDate){
 if(!/^[A-Za-z0-9_-]{1,128}$/.test(employeeId)||!/^\d{4}-\d{2}-\d{2}$/.test(workDate))
  throw Error("Invalid employee ID or date for timecard import.");
 return "timecard_"+employeeId+"_"+workDate;
}

export function groupTimecards(rows){
 const groups=[];let group=[],employees=new Set();
 for(const item of rows){
  if(!item.employee?.id)throw Error("Import row is missing a matched employee.");
  const uid=item.employee.id;
  if(group.length>=60||(!employees.has(uid)&&employees.size>=12)){
   groups.push(group);group=[];employees=new Set();
  }
  group.push(item);employees.add(uid);
 }
 if(group.length)groups.push(group);
 return groups;
}
