import {toCents} from "./payroll-core.js";
export const CLIENT_PLANS=Object.freeze(["starter","standard","enterprise"]);
export const EMPLOYEE_STATUSES=Object.freeze(["active","leave","inactive"]);
export const PAY_FREQUENCIES=Object.freeze(["weekly","biweekly","semimonthly","monthly"]);
export const ACCESS_ROLES=Object.freeze(["client_admin","payroll_specialist","viewer"]);
const safe=(s,n)=>String(s??"").trim().slice(0,n);
export function parseCsv(text){
 if(typeof text!=="string"||text.length>160000)throw Error("CSV file is too large");
 const rows=[],row=[];let token="",quoted=false;
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(c==='"'){
   if(quoted&&text[i+1]==='"'){token+='"';i++}else quoted=!quoted;
  }else if(c===","&&!quoted){row.push(token);token=""}
  else if((c==="\n"||c==="\r")&&!quoted){
   if(c==="\r"&&text[i+1]==="\n")i++;
   row.push(token);if(row.some(v=>v.trim()))rows.push([...row]);row.length=0;token="";
  }else token+=c;
 }
 if(quoted)throw Error("Unclosed quoted CSV value");
 row.push(token);if(row.some(v=>v.trim()))rows.push(row);
 return rows;
}
export function importEmployees(csv){
 const rows=parseCsv(csv);
 if(rows.length<2)throw Error("CSV requires a header and employee rows");
 if(rows.length>101)throw Error("Import at most 100 employees at once");
 const header=rows.shift().map(x=>x.trim().toLowerCase());
 const columns=["name","title","department","paytype","payfrequency","hourlyrate","annualsalary"];
 const pos=Object.fromEntries(columns.map(k=>[k,header.indexOf(k)]));
 if(pos.name<0||pos.paytype<0)throw Error("Required CSV headers: name, payType");
 const employees=[];
 for(let i=0;i<rows.length;i++){
  const line=rows[i],value=key=>pos[key]<0?"":String(line[pos[key]]||"").trim();
  const displayName=safe(value("name"),120),jobTitle=safe(value("title"),100),department=safe(value("department"),100);
  const payType=value("paytype").toLowerCase(),payFrequency=value("payfrequency").toLowerCase()||"biweekly";
  if(displayName.length<2)throw Error("Row "+(i+2)+": employee name is missing");
  if(!["hourly","salary"].includes(payType))throw Error("Row "+(i+2)+": invalid pay type");
  if(!PAY_FREQUENCIES.includes(payFrequency))throw Error("Row "+(i+2)+": invalid pay frequency");
  const hourlyRateCents=payType==="hourly"?toCents(value("hourlyrate")):0;
  const annualSalaryCents=payType==="salary"?toCents(value("annualsalary")):0;
  employees.push({displayName,jobTitle,department,payType,payFrequency,hourlyRateCents,annualSalaryCents,status:"active"});
 }
 return employees;
}
export function findPossibleDuplicates(incoming,existing){
 const fingerprint=e=>[String(e.displayName||"").toLowerCase().trim(),String(e.jobTitle||"").toLowerCase().trim()].join("|");
 const known=new Set(existing.map(fingerprint)),seen=new Set(),matches=[];
 incoming.forEach((row,i)=>{const key=fingerprint(row);if(known.has(key)||seen.has(key))matches.push(i+2);seen.add(key)});
 return matches;
}