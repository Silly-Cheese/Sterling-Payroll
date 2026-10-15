// Progressive disclosure for high-density workspaces. Existing forms stay in their
// owning module's DOM root, preserving event listeners and role-based visibility.
export function compactForm({root=document,formId,label,summary="",mode="dialog"}){
 const form=root.querySelector("#"+formId);
 if(!form||form.dataset.compacted)return null;
 const panel=form.closest(".panel");
 if(!panel)return null;
 form.dataset.compacted="true";
 if(mode==="collapse"){
  const btn=document.createElement("button");
  btn.type="button";btn.className="btn workspace-launch";btn.textContent=label;
  const container=document.createElement("div");
  container.className="workspace-collapsible hidden";
  form.parentNode.insertBefore(container,form);
  container.append(form);
  panel.querySelector("h2")?.after(btn);
  btn.onclick=()=>{container.classList.toggle("hidden");btn.textContent=container.classList.contains("hidden")?label:"Close editor"};
  const sync=()=>{btn.hidden=form.classList.contains("hidden");if(btn.hidden)container.classList.add("hidden")};
  new MutationObserver(sync).observe(form,{attributes:true,attributeFilter:["class"]});sync();
  return {close:()=>{container.classList.add("hidden");btn.textContent=label}};
 }
 const layout=panel.parentElement;
 const dialog=document.createElement("dialog");
 dialog.className="workspace-form-dialog";
 const head=document.createElement("header"),heading=document.createElement("h2"),close=document.createElement("button");
 heading.textContent=label;close.type="button";close.className="workspace-form-close";close.textContent="✕";close.setAttribute("aria-label","Close form");
 head.append(heading,close);dialog.append(head);
 const action=document.createElement("div");
 action.className="workspace-action-bar";
 const title=document.createElement("div"),titleHead=document.createElement("strong"),desc=document.createElement("small");
 titleHead.textContent=summary||"Manage this workspace";desc.textContent="Search the records below. Open a form only when needed.";
 title.append(titleHead,desc);
 const open=document.createElement("button");
 open.type="button";open.className="btn primary";open.textContent="+ "+label;open.onclick=()=>{if(!form.classList.contains("hidden"))dialog.showModal()};
 close.onclick=()=>dialog.close();
 dialog.addEventListener("click",event=>{if(event.target===dialog)dialog.close()});
 action.append(title,open);
 const next=[...layout.children].find(element=>element!==panel&&element.classList?.contains("panel"))||
  [...layout.children].find(element=>element!==panel);
 if(next)next.prepend(action);else layout.prepend(action);
 panel.remove();panel.classList.add("workspace-form-panel");
 dialog.append(panel);root.append(dialog);
 if(layout.classList.contains("two-col")||layout.classList.contains("ops-grid"))layout.classList.add("workspace-list-wide");
 const sync=()=>{
  open.hidden=form.classList.contains("hidden");
  if(open.hidden&&dialog.open)dialog.close();
 };
 new MutationObserver(sync).observe(form,{attributes:true,attributeFilter:["class"]});
 sync();
 form.addEventListener("sterling:complete",()=>{if(dialog.open)dialog.close()});
 return {open:()=>open.click(),close:()=>dialog.close()};
}
export function buildPortalTabs(root,groups){
 if(root.querySelector(".portal-view-tabs"))return;
 const tabs=document.createElement("div");tabs.className="portal-view-tabs";
 const sections=[];
 for(const [id,label] of groups){
  const node=root.querySelector("#"+id);
  if(!node)continue;
  node.dataset.portalView=id;
  const button=document.createElement("button");
  button.type="button";button.textContent=label;button.dataset.portalTarget=id;
  button.onclick=()=>select(id);tabs.append(button);sections.push(node);
 }
 if(sections.length<2)return;
 const first=sections[0],container=document.createElement("div");
 container.className="portal-view-content";
 first.before(tabs);
 for(const node of sections)container.append(node);
 tabs.after(container);
 function select(id){
  for(const node of sections)node.classList.toggle("hidden",node.dataset.portalView!==id);
  for(const btn of tabs.children){const active=btn.dataset.portalTarget===id;btn.classList.toggle("active",active);btn.setAttribute("aria-selected",String(active))}
 }
 select(sections[0].dataset.portalView);
}
