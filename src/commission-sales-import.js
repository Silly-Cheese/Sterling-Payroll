import {commissionAmount} from "./commission-core.js";

const tidy = value => String(value ?? "").trim().replace(/\s+/g," ");
const employeeKey = value => tidy(value).toLocaleLowerCase("en-US");
const moneyCents = value => {
 const clean = tidy(value).replace(/^\$/,"").replace(/,/g,"");
 if(!/^(?:\d+)(?:\.\d{1,2})?$/.test(clean))throw Error("Sale amount must be a positive dollar value (two decimals maximum).");
 const [whole,decimal=""] = clean.split(".");
 const cents = Number(whole)*100+Number(decimal.padEnd(2,"0"));
 if(!Number.isSafeInteger(cents)||cents<1||cents>1_000_000_000)throw Error("Sale amount must be between $0.01 and $10,000,000.");
 return cents;
};
export function normalizeSaleDate(value){
 const raw=tidy(value);
 const matched=/^(\d{4})-(\d{2})-(\d{2})$/.exec(raw)||/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(raw);
 if(!matched)throw Error("Use YYYY-MM-DD or MM/DD/YYYY for the sale date.");
 const iso=matched[1].length===4?raw:matched[3]+"-"+matched[1].padStart(2,"0")+"-"+matched[2].padStart(2,"0");
 const date=new Date(iso+"T00:00:00Z");
 if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==iso)throw Error("Invalid calendar date.");
 return iso;
}
export function parseSalesCsv(source,{maxRows=500}={}){
 if(typeof source!=="string"||source.length>512_000)throw Error("CSV file is too large (512 KB maximum).");
 const csv=source.replace(/^\uFEFF/,"");
 const data=[];let cells=[],value="",quoted=false,line=1;
 for(let i=0;i<csv.length;i++){
  const c=csv[i];
  if(quoted){
   if(c==='"'&&csv[i+1]==='"'){value+='"';i++;}
   else if(c==='"')quoted=false;
   else value+=c;
  }else if(c==='"'){
   if(value!=="")throw Error("Unexpected CSV quote on line "+line+".");
   quoted=true;
  }else if(c===","){cells.push(value);value="";}
  else if(c==="\n"||c==="\r"){
   if(c==="\r"&&csv[i+1]==="\n")i++;
   cells.push(value);value="";
   if(cells.some(v=>v.trim()))data.push({line,cells});
   cells=[];line++;
  }else value+=c;
 }
 if(quoted)throw Error("Unclosed quoted CSV field.");
 cells.push(value);
 if(cells.some(v=>v.trim()))data.push({line,cells});
 if(!data.length)throw Error("CSV file is empty.");
 const aliases={
  employeeName:["employeename","employee","name","staffname"],
  saleDate:["saledate","date","transactiondate"],
  saleAmount:["saleamount","amount","amountsold","saleprice","soldfor","salevalue"],
  description:["description","item","sale","product","whatwassold"],
  reference:["reference","salereference","externalreference","transactionid"]
 };
 const headings=data.shift().cells.map(x=>x.replace(/[^a-z0-9]/gi,"").toLowerCase());
 const indexes={};
 for(const [key,names] of Object.entries(aliases)){
  indexes[key]=headings.findIndex(h=>names.includes(h));
  if(indexes[key]<0&&key!=="reference")throw Error("Missing CSV column: "+key+". Download the template for the correct headers.");
 }
 if(data.length>maxRows)throw Error("Import up to "+maxRows+" sales at a time.");
 return data.map(({line,cells})=>{
  if(cells.length!==headings.length)throw Error("Column count differs from the header on line "+line+".");
  const get=k=>indexes[k]<0?"":tidy(cells[indexes[k]]);
  return {line,employeeName:get("employeeName"),saleDate:get("saleDate"),
   saleAmount:get("saleAmount"),description:get("description"),reference:get("reference")};
 });
}
function hexHash(s){
 let a=2166136261,b=2246822519;
 for(let i=0;i<s.length;i++){
  const c=s.charCodeAt(i);a=Math.imul(a^c,16777619);b=Math.imul(b^(c+i),2246822519);
 }
 return (a>>>0).toString(16).padStart(8,"0")+(b>>>0).toString(16).padStart(8,"0");
}
export function prepareSalesImport(rows,employees,plans){
 const byName=new Map();
 for(const e of employees){
  const k=employeeKey(e.displayName);
  if(!k)continue;
  if(!byName.has(k))byName.set(k,[]);
  byName.get(k).push(e);
 }
 const duplicates=new Map(),valid=[],errors=[];
 for(const row of rows){
  try{
   const matches=byName.get(employeeKey(row.employeeName))||[];
   if(!matches.length)throw Error("Employee name not found. Use their exact name as shown in Sterling.");
   if(matches.length>1)throw Error("Multiple employees share that name. Rename them uniquely before importing.");
   const employee=matches[0],plan=plans.get(employee.id);
   if(employee.status!=="active")throw Error("This employee is not active.");
   if(!plan?.active)throw Error("Assign an active commission plan to this employee first.");
   const saleDate=normalizeSaleDate(row.saleDate);
   const saleAmountCents=moneyCents(row.saleAmount);
   const description=tidy(row.description);
   if(description.length<3||description.length>160)throw Error("Description must be 3–160 characters.");
   const reference=tidy(row.reference);
   if(reference.length>100)throw Error("Reference may not exceed 100 characters.");
   const commissionCents=commissionAmount(saleAmountCents,plan);
   const identity=[employee.id,saleDate,saleAmountCents,description.toLowerCase(),reference];
   const key=JSON.stringify(identity),occur=(duplicates.get(key)||0)+1;
   duplicates.set(key,occur);
   const id="import-"+hexHash(key+"#"+(reference?"ref":occur));
   valid.push({id,line:row.line,employeeId:employee.id,employeeName:employee.displayName,
    saleDate,description,saleAmountCents,commissionCents,type:plan.type,
    rateBasisPoints:plan.rateBasisPoints,fixedCents:plan.fixedCents,status:"pending",
    approvedBy:"",paidRunId:"",reference});
  }catch(error){errors.push({line:row.line,name:row.employeeName||"Unknown",message:error.message});}
 }
 return {valid,errors};
}
export const SALES_SORTS = ["date-desc","date-asc","employee-asc","employee-desc","amount-desc","amount-asc","commission-desc","commission-asc"];
export function filterSales(sales,{employeeId="",status="all",start="",end="",search="",sort="date-desc"}={},nameOf=()=>"" ){
 const term=employeeKey(search);
 return sales.filter(s=>(!employeeId||s.employeeId===employeeId)&&
  (status==="all"||s.status===status)&&(!start||s.saleDate>=start)&&(!end||s.saleDate<=end)&&
  (!term||[nameOf(s.employeeId),s.description,s.saleDate].some(x=>employeeKey(x).includes(term))))
 .sort((a,b)=>{
  const n=field=>Number(a[field]||0)-Number(b[field]||0);
  const byDate=(b.saleDate||"").localeCompare(a.saleDate||"");
  const byName=nameOf(a.employeeId).localeCompare(nameOf(b.employeeId));
  const tie=byDate||String(a.id).localeCompare(String(b.id));
  switch(sort){
   case "date-asc":return -byDate||byName||tie;
   case "employee-asc":return byName||tie;
   case "employee-desc":return -byName||tie;
   case "amount-desc":return -n("saleAmountCents")||tie;
   case "amount-asc":return n("saleAmountCents")||tie;
   case "commission-desc":return -n("commissionCents")||tie;
   case "commission-asc":return n("commissionCents")||tie;
   default:return byDate||byName||tie;
  }
 });
}
export function saleSummary(rows){
 return rows.reduce((t,s)=>{
  t.count++;t.soldCents+=Number(s.saleAmountCents)||0;
  if(s.status==="approved"){t.approvedCents+=Number(s.commissionCents)||0;t.approved++;}
  if(s.status==="pending"){t.pendingCents+=Number(s.commissionCents)||0;t.pending++;}
  return t;
 },{count:0,soldCents:0,approvedCents:0,pendingCents:0,approved:0,pending:0});
}
