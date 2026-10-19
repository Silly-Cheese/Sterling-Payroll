import {summarizePayrollWorkspace,payrollRunSteps} from "./payroll-workflow.js";
import {usesTimecards,payrollRunModeLabel} from "./payroll-run-modes.js?v=sterling-payroll-modes-20261019";
export function mountPayrollExperience({getState,onNavigate,onCreate,onRefresh}){
 const $=id=>document.getElementById(id);
 const heading=document.querySelector(".page-heading");
 const bar=document.createElement("div");bar.className="sterling-context-bar";bar.id="sterlingContextBar";
 const information=document.createElement("div");information.className="sterling-context-copy";
 const badge=document.createElement("span");badge.className="sterling-context-badge";
 const info=document.createElement("span");info.className="sterling-context-info";
 information.append(badge,info);
 const actions=document.createElement("div");actions.className="sterling-context-actions";
 const reload=document.createElement("button");reload.className="btn small";reload.type="button";reload.textContent="↻ Refresh";
 const create=document.createElement("button");create.className="btn primary small";create.type="button";
 actions.append(reload,create);bar.append(information,actions);heading.after(bar);
 const payroll=$("page-payroll");
 const workflow=document.createElement("section");workflow.className="sterling-payroll-workflow";
 workflow.setAttribute("aria-label","Payroll processing workflow");
 const intro=document.createElement("div");intro.className="sterling-workflow-intro";
 intro.innerHTML='<div><span class="eyebrow">PAYROLL WORKFLOW</span><h2>From approved hours to a finalized pay run.</h2><p>Follow the same four stages every pay period. All payments remain simulated.</p></div>';
 const steps=document.createElement("div");steps.className="sterling-workflow-steps";
 const message=document.createElement("p");message.className="sterling-workflow-message";message.setAttribute("role","status");
 workflow.append(intro,steps,message);payroll.prepend(workflow);
 const configs={
  dashboard:{description:"Your authorized Sterling workspace",action:"Open payroll",page:"payroll"},
  clients:{description:"Manage separate company workspaces",action:"Add company",form:"clientForm"},
  employees:{description:"Browse employee compensation and status",action:"Add employee",form:"employeeForm"},
  time:{description:"Filter timecards by employee, day or period",action:"Record time",form:"timeForm"},
  payroll:{description:"Create, review and authorize simulated pay runs",action:"Create payroll run",form:"runForm"},
  operations:{description:"Update employee records and import staff",action:"Employee directory",page:"employees"},
  commissions:{description:"Assign plans and review fictional sales",action:"Sales register",page:"commissions"},
  service:{description:"Billing and support use distinct authorizations",action:"Support desk",page:"service"},
  access:{description:"Company memberships are Sterling-managed",action:"Open support",page:"service"},
  staff:{description:"Sterling-level access administration",action:"Company directory",page:"clients"},
  assurance:{description:"Operational integrity and export controls",action:"Payroll runs",page:"payroll"},
  employeePortal:{description:"Your private simulated pay records",action:"My statements",page:"employeePortal"}
 };
 let pending=false;
 reload.onclick=async()=>{
  if(pending)return;pending=true;reload.disabled=true;reload.textContent="Refreshing…";
  try{await onRefresh();sync()}
  catch(error){info.textContent="Refresh failed: "+(error?.message||error)}
  finally{reload.disabled=false;reload.textContent="↻ Refresh";pending=false;}
 };
 const stepPages=["time","payroll","payroll","payroll"];
 function renderWorkflow(){
  const state=getState(),summary=summarizePayrollWorkspace(state);
  workflow.classList.toggle("hidden",state.page!=="payroll");
  if(state.page!=="payroll")return;
  const run=state.runs.find(r=>r.id===state.selectedRun)||null;
  const stages=payrollRunSteps(run);
  steps.replaceChildren();
  stages.forEach((step,index)=>{
   const b=document.createElement("button");b.type="button";
   b.className="sterling-workflow-step"+(step.current?" current":"")+(step.complete?" complete":"");
   const number=document.createElement("span");number.className="sterling-workflow-number";number.textContent=step.complete?"✓":String(index+1);
   const content=document.createElement("span"),name=document.createElement("strong"),hint=document.createElement("small");
   name.textContent=step.label;
   hint.textContent=[
    usesTimecards(run?.processingMode)?"Approve time entries":"Approve sales commissions","Create and calculate","Submit and approve","Confirm and finalize"
   ][index];content.append(name,hint);b.append(number,content);
   b.onclick=()=>{
    onNavigate(index===0&&!usesTimecards(run?.processingMode)?"commissions":stepPages[index]);
    if(index===1&&!run)onCreate("runForm");
    if(index===0&&usesTimecards(run?.processingMode))document.getElementById("timeViewApprovals")?.click();
   if(index===0&&!usesTimecards(run?.processingMode))document.getElementById("commissionSalesTab")?.click();
   };
   steps.append(b);
  });
  message.textContent=!run?
   "Choose a processing mode and create a named draft pay run.":
   run.status==="finalized"?"This simulated pay period is finalized and its existing pay lines are locked.":
   run.status==="rejected"?"This run was rejected. Reopen its draft, correct inputs, and submit again.":
   run.status==="draft"?"This run is a draft. Generate pay lines and check each employee before submitting.":
   run.status==="submitted"?"Submitted for a different authorized reviewer to approve or reject.":
   run.status==="approved"?"Approved. A separate authorized finalizer may complete the period.":
   "Select a payroll run to inspect its current stage.";
  if(summary.pendingTime&&usesTimecards(run?.processingMode))message.textContent+=" There are "+summary.pendingTime+" pending time entries in currently loaded records.";
  if(run)message.textContent="["+payrollRunModeLabel(run.processingMode)+"] "+message.textContent;
 }
 function sync(){
  const state=getState(),config=configs[state.page]||configs.dashboard;
  const current=state.tenants?.find(t=>t.id===state.tenantId);
  badge.textContent=current?.name||"STERLING PAYROLL";
  info.textContent=config.description;
  create.textContent="+ "+config.action;
  const active=Boolean(state.tenantId);
  create.disabled=Boolean(config.form)&&(!active&&state.page!=="clients");
  if(state.role==="viewer"&&config.form)create.disabled=true;
  if(state.role==="employee"&&config.form)create.disabled=true;
  if(state.page==="clients"&&!state.platformWrite)create.disabled=true;
  create.onclick=()=>{
   if(create.disabled)return;
   if(config.form)onCreate(config.form);
   else if(config.page&&config.page!==state.page)onNavigate(config.page);
   else if(state.page==="commissions")document.getElementById("commissionSalesTab")?.click();
   else if(state.page==="service")document.querySelector('[data-p5-tab="support"]')?.click();
   else if(state.page==="employeePortal")document.querySelector('[data-p4-tab="statements"]')?.click();
  };
  renderWorkflow();
 }
 sync();
 return {sync};
}
