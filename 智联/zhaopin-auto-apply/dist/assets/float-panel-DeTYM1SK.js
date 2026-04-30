import{a as L}from"./messages-CPfQMOYm.js";import{d as D,s as H}from"./index.ts-D_Ez8Txe.js";const x="zhaopin-auto-apply-panel",_="zhaopin_panel_position";let y=[],f=new Set,E=[],z="",d=null,h=!1,b=!1,k=!0,w=!1,g=A("filter")||"",v=A("exclude")||"";function A(e){try{return localStorage.getItem("zhaopin_"+e+"_kw")}catch{return null}}function $(){try{localStorage.setItem("zhaopin_filter_kw",g),localStorage.setItem("zhaopin_exclude_kw",v)}catch{}}function Y(){try{const e=localStorage.getItem(_);if(e)return JSON.parse(e)}catch{}return{left:window.innerWidth-440,top:80}}function U(e,t){try{localStorage.setItem(_,JSON.stringify({left:e,top:t}))}catch{}}const C=Y();function K(){const e=document.createElement("div");return e.id=x,e.innerHTML=`
    <style>
      #${x} {
        position: fixed;
        left: ${C.left}px;
        top: ${C.top}px;
        z-index: 2147483647;
        width: 380px;
        background: #fff;
        border-radius: 10px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.1);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
        font-size: 13px;
        color: #333;
        user-select: none;
        transition: opacity 0.2s, transform 0.2s;
      }
      #${x}.minimized .panel-body { display: none; }
      #${x}.minimized { width: auto; }
      #${x}.hidden { opacity: 0; pointer-events: none; transform: scale(0.95); }

      .panel-header {
        display: flex;
        align-items: center;
        padding: 10px 14px;
        background: linear-gradient(135deg, #4361ee, #3aafe6);
        border-radius: 10px 10px 0 0;
        cursor: move;
        color: #fff;
        font-weight: 600;
        font-size: 14px;
      }
      .minimized .panel-header { border-radius: 10px; }

      .panel-header .title {
        flex: 1;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .panel-header .btn-icon {
        width: 28px;
        height: 28px;
        border: none;
        background: rgba(255,255,255,0.2);
        color: #fff;
        border-radius: 6px;
        cursor: pointer;
        font-size: 16px;
        display: flex;
        align-items: center;
        justify-content: center;
        margin-left: 6px;
        transition: background 0.15s;
        flex-shrink: 0;
      }
      .panel-header .btn-icon:hover { background: rgba(255,255,255,0.35); }

      .panel-body {
        max-height: 420px;
        overflow-y: auto;
        padding: 12px 14px;
      }
      .panel-body::-webkit-scrollbar { width: 5px; }
      .panel-body::-webkit-scrollbar-thumb { background: #d0d0d0; border-radius: 3px; }

      .section { margin-bottom: 10px; }

      .btn {
        width: 100%;
        padding: 8px 14px;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-size: 13px;
        font-weight: 500;
        transition: background 0.15s, opacity 0.15s;
      }
      .btn:disabled { opacity: 0.5; cursor: not-allowed; }
      .btn-primary { background: #4361ee; color: #fff; }
      .btn-primary:hover:not(:disabled) { background: #3a56d4; }
      .btn-success { background: #27ae60; color: #fff; }
      .btn-success:hover:not(:disabled) { background: #219a52; }
      .btn-warning { background: #f39c12; color: #fff; }
      .btn-danger { background: #e74c3c; color: #fff; }

      .job-item {
        display: flex;
        align-items: flex-start;
        padding: 8px 0;
        border-bottom: 1px solid #f0f0f0;
        cursor: pointer;
        transition: background 0.1s;
      }
      .job-item:hover { background: #f8f9fa; }
      .job-item.applied { opacity: 0.45; pointer-events: none; }
      .job-item input[type=checkbox] { margin-right: 8px; margin-top: 2px; flex-shrink: 0; }

      .job-info { flex: 1; min-width: 0; }
      .job-title { font-size: 13px; font-weight: 500; margin-bottom: 2px; }
      .job-meta { font-size: 11px; color: #888; }
      .job-salary { color: #e74c3c; font-size: 12px; }

      .progress-wrap { margin-bottom: 8px; }
      .progress-bar {
        height: 6px;
        background: #eee;
        border-radius: 3px;
        overflow: hidden;
        margin-top: 4px;
      }
      .progress-fill {
        height: 100%;
        background: #27ae60;
        border-radius: 3px;
        transition: width 0.3s;
      }
      .progress-fill.paused { background: #f39c12; }

      .badge {
        display: inline-block;
        padding: 1px 6px;
        margin-right: 3px;
        background: #f0f0f0;
        border-radius: 3px;
        font-size: 10px;
        color: #888;
      }

      select {
        width: 100%;
        padding: 6px 8px;
        border: 1px solid #ddd;
        border-radius: 6px;
        font-size: 12px;
        background: #fff;
      }

      .stats { display: flex; gap: 12px; font-size: 11px; margin-top: 4px; }
      .stats .ok { color: #27ae60; }
      .stats .skip { color: #999; }
      .stats .err { color: #e74c3c; }
    </style>

    <div class="panel-header" id="panel-drag-handle">
      <span class="title">🤖 智联自动投递</span>
      <span id="panel-job-count" style="font-size:11px;opacity:0.85;margin-right:8px;white-space:nowrap;"></span>
      <button class="btn-icon" id="btn-minimize" title="折叠/展开">−</button>
      <button class="btn-icon" id="btn-toggle" title="隐藏面板" style="font-size:13px;">×</button>
    </div>

    <div class="panel-body">
      <!-- 进度条 -->
      <div class="section progress-wrap" id="progress-section" style="display:none;">
        <div style="display:flex;justify-content:space-between;font-size:11px;color:#666;">
          <span id="progress-text">0/0</span>
          <span id="progress-percent">0%</span>
        </div>
        <div class="progress-bar"><div class="progress-fill" id="progress-fill" style="width:0%"></div></div>
        <div id="progress-status" style="font-size:11px;color:#666;margin-top:2px;"></div>
        <div class="stats" id="progress-stats"></div>
      </div>

      <!-- 扫描按钮 -->
      <div class="section" id="scan-section">
        <button class="btn btn-primary" id="btn-scan">🔍 扫描当前页职位</button>
        <div id="scan-info" style="font-size:11px;color:#888;margin-top:4px;text-align:center;"></div>
      </div>

      <!-- 模板选择 -->
      <div class="section" id="template-section" style="display:none;">
        <div style="font-size:11px;color:#888;margin-bottom:4px;">招呼语模板：</div>
        <select id="template-select"></select>
      </div>

      <!-- 职位列表 -->
      <div class="section" id="job-list-section" style="display:none;">
        <!-- 关键字筛选 -->
        <div style="display:flex;gap:6px;margin-bottom:6px;">
          <input type="text" id="filter-input" placeholder="🔍 包含关键字..." style="flex:1;padding:6px 10px;border:1px solid #4caf50;border-radius:6px;font-size:12px;box-sizing:border-box;">
          <input type="text" id="exclude-input" placeholder="✕ 排除关键字..." style="flex:1;padding:6px 10px;border:1px solid #e74c3c;border-radius:6px;font-size:12px;box-sizing:border-box;">
        </div>
        <div style="display:flex;align-items:center;margin-bottom:6px;">
          <label style="font-size:11px;color:#888;cursor:pointer;">
            <input type="checkbox" id="select-all" style="margin-right:4px;"> 全选
          </label>
          <span style="flex:1;"></span>
          <span id="job-count" style="font-size:11px;color:#888;"></span>
        </div>
        <div id="job-list" style="max-height:220px;overflow-y:auto;"></div>
      </div>

      <!-- 控制按钮 -->
      <div class="section" id="controls-section" style="display:none;">
        <div id="controls-buttons" style="display:flex;gap:8px;"></div>
      </div>
    </div>
  `,e}function j(){let e=y;const t=g.trim().toLowerCase();if(t){const n=t.split(/\s+/);e=e.filter(a=>n.every(s=>a.title.toLowerCase().includes(s)||a.company.toLowerCase().includes(s)||a.location.toLowerCase().includes(s)||a.tags.some(o=>o.toLowerCase().includes(s))))}const i=v.trim().toLowerCase();if(i){const n=i.split(/\s+/);e=e.filter(a=>!n.some(s=>a.title.toLowerCase().includes(s)||a.company.toLowerCase().includes(s)||a.location.toLowerCase().includes(s)||a.tags.some(o=>o.toLowerCase().includes(s))))}return e}function S(e,t){if(!t.trim())return B(e);const i=B(e),n=B(t.trim()),a=new RegExp(`(${n.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")})`,"gi");return i.replace(a,'<mark style="background:#fff3b0;color:#333;padding:0 1px;border-radius:2px;">$1</mark>')}function B(e){const t={"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"};return e.replace(/[&<>"']/g,i=>t[i])}function J(){const e=document.getElementById("job-list"),t=document.getElementById("job-count");if(!e||!t)return;const i=j(),n=i.filter(s=>f.has(s.id)).length,a=g||v;if(t.textContent=a?`筛选 ${i.length}/${y.length}，选 ${n} 个`:`共 ${y.length} 个，选 ${f.size} 个`,i.length===0){e.innerHTML='<div style="text-align:center;padding:20px;color:#999;font-size:12px;">无匹配职位</div>';return}e.innerHTML=i.map(s=>`
    <div class="job-item${s.alreadyApplied?" applied":""}" data-job-id="${s.id}">
      <input type="checkbox" ${f.has(s.id)?"checked":""} ${s.alreadyApplied?"disabled":""}>
      <div class="job-info">
        <div class="job-title">
          ${S(s.title,g)}
          ${s.alreadyApplied?'<span style="color:#999;font-size:10px;margin-left:4px;">已投递</span>':""}
        </div>
        <div class="job-meta">${S(s.company,g)}</div>
        <div style="font-size:12px;">
          <span class="job-salary">${s.salary}</span>
          ${s.location?`<span class="badge">${S(s.location,g)}</span>`:""}
          ${s.experience?`<span class="badge">${s.experience}</span>`:""}
        </div>
      </div>
    </div>
  `).join(""),e.querySelectorAll(".job-item").forEach(s=>{const o=s.getAttribute("data-job-id"),l=s.querySelector("input[type=checkbox]");s.addEventListener("click",r=>{r.target!==l&&(l.checked=!l.checked,T(o))}),l.addEventListener("change",()=>T(o))})}function O(){const e=document.getElementById("template-select");e&&(e.innerHTML=E.map(t=>`<option value="${t.id}" ${t.id===z?"selected":""}>${t.name}${t.isDefault?" (默认)":""}</option>`).join(""),e.addEventListener("change",()=>{z=e.value}))}function F(){const e=document.getElementById("progress-section"),t=document.getElementById("progress-fill"),i=document.getElementById("progress-text"),n=document.getElementById("progress-percent");document.getElementById("progress-status");const a=document.getElementById("progress-stats");if(!d||!h){e&&(e.style.display="none");return}e&&(e.style.display="block");const s=d.currentJobIndex,o=d.totalJobs,l=o>0?Math.round(s/o*100):0;i&&(i.textContent=`${s}/${o}`),n&&(n.textContent=`${l}%`),t&&(t.style.width=`${l}%`,t.className="progress-fill"+(b?" paused":""));const r=d.results.filter(m=>m.status==="success").length,c=d.results.filter(m=>m.status==="already_applied").length,p=d.results.filter(m=>m.status==="error").length;a&&(a.innerHTML=`<span class="ok">✓ ${r}</span><span class="skip">− ${c}</span><span class="err">✗ ${p}</span>`)}function N(){const e=document.getElementById("controls-buttons"),t=document.getElementById("scan-section"),i=document.getElementById("template-section"),n=document.getElementById("job-list-section"),a=document.getElementById("controls-section");e&&(h?(t&&(t.style.display="none"),i&&(i.style.display="none"),n&&(n.style.display="none"),a&&(a.style.display="block"),b?e.innerHTML=`
        <button class="btn btn-success" id="btn-resume" style="flex:1;">▶ 继续</button>
        <button class="btn btn-danger" id="btn-cancel">✕ 取消</button>
      `:e.innerHTML=`
        <button class="btn btn-warning" id="btn-pause" style="flex:1;">⏸ 暂停</button>
        <button class="btn btn-danger" id="btn-cancel">✕ 取消</button>
      `):(t&&(t.style.display="block"),i&&(i.style.display=E.length>0?"block":"none"),n&&(n.style.display=y.length>0?"block":"none"),a&&(a.style.display=y.length>0?"block":"none"),e.innerHTML=`
      <button class="btn btn-success" id="btn-apply" style="flex:1;" ${f.size===0?"disabled":""}>
        🚀 一键投递 (${f.size})
      </button>
    `))}function u(){J(),O(),F(),N()}function T(e){const t=new Set(f);t.has(e)?t.delete(e):t.add(e),f=t,J(),N()}function q(e){const t=e.querySelector(".panel-header");if(!t)return;let i=!1,n=0,a=0,s=0,o=0;t.addEventListener("mousedown",l=>{l.target.closest("button")||(i=!0,n=l.clientX,a=l.clientY,s=e.offsetLeft,o=e.offsetTop,t.style.cursor="grabbing",l.preventDefault())}),document.addEventListener("mousemove",l=>{if(!i)return;const r=l.clientX-n,c=l.clientY-a;let p=s+r,m=o+c;p=Math.max(0,Math.min(window.innerWidth-e.offsetWidth,p)),m=Math.max(0,Math.min(window.innerHeight-40,m)),e.style.left=p+"px",e.style.top=m+"px",e.style.right="auto",e.style.bottom="auto"}),document.addEventListener("mouseup",()=>{i&&(i=!1,t.style.cursor="move",U(e.offsetLeft,e.offsetTop))})}let I=!1;function P(){I=!0,h=!1,b=!1,u(),setTimeout(W,1500)}function V(){chrome.runtime.onMessage.addListener(e=>{if(e.type==="APPLY_PROGRESS"){const{current:t,total:i,currentJob:n,status:a,message:s}=e.payload;if(I)return;d?t>=d.currentJobIndex&&(d.currentJobIndex=t,d.totalJobs=i):d={isRunning:!0,isPaused:!1,currentJobIndex:t,totalJobs:i,results:[],startedAt:Date.now()},a&&n&&n!=="准备"&&n!=="完成"&&(d.results.some(r=>r.jobTitle===n&&r.timestamp>Date.now()-12e4)||d.results.push({jobId:"",companyName:"",jobTitle:n,templateUsed:"",greetingSent:"",detailUrl:"",status:a,timestamp:Date.now()})),h=!0,b=!1;const o=document.getElementById("progress-status");o&&(o.textContent=s||n||""),u()}e.type==="VERIFICATION_REQUIRED"&&alert(`验证码提示: ${e.payload.message}
职位: ${e.payload.jobTitle}`)}),chrome.storage.onChanged.addListener(e=>{if(e.apply_state){const t=e.apply_state.newValue;t&&!t.isRunning&&!I&&(d=t,P()),!t&&!I&&P()}})}async function W(){var e;try{const t=await chrome.runtime.sendMessage({type:"SCAN_REQUEST"});(e=t==null?void 0:t.payload)!=null&&e.jobs}catch{}}function X(){var e,t,i,n,a,s;(e=document.getElementById("btn-minimize"))==null||e.addEventListener("click",()=>{w=!w;const o=document.getElementById(x);o&&(o.className=w?"minimized":"",document.getElementById("btn-minimize").textContent=w?"+":"−")}),(t=document.getElementById("btn-toggle"))==null||t.addEventListener("click",()=>{k=!k;const o=document.getElementById(x);o&&(o.className=k?w?"minimized":"":"hidden"),R(!k)}),(i=document.getElementById("btn-scan"))==null||i.addEventListener("click",async()=>{const o=document.getElementById("btn-scan"),l=document.getElementById("scan-info");o.textContent="⏳ 扫描中...",o.disabled=!0;try{if(D()!=="search"){l&&(l.textContent="请在智联招聘搜索页使用此功能"),o.textContent="🔍 扫描当前页职位",o.disabled=!1;return}const r=H();y=r.jobs,f=new Set,g="",v="",$();const c=document.getElementById("filter-input"),p=document.getElementById("exclude-input");c&&(c.value=""),p&&(p.value=""),u(),l&&(l.textContent=`已扫描 ${y.length} 个职位（第 ${r.pageNumber}/${r.totalPages} 页）`)}catch{l&&(l.textContent="扫描失败，请刷新页面重试")}o.textContent="🔍 重新扫描",o.disabled=!1}),document.addEventListener("click",async o=>{const l=o.target;if(l.id==="btn-apply"){const r=y.filter(c=>f.has(c.id));if(r.length===0)return;try{I=!1,d={isRunning:!0,isPaused:!1,currentJobIndex:0,totalJobs:r.length,results:[],startedAt:Date.now()},h=!0,b=!1,u(),await L({type:"APPLY_BATCH",payload:{jobs:r,templateId:z}})}catch(c){console.error("投递启动失败:",c)}}l.id==="btn-cancel"&&(await L({type:"CANCEL_APPLY"}),h=!1,b=!1,u()),l.id==="btn-pause"&&(await L({type:"PAUSE_APPLY"}),b=!0,u()),l.id==="btn-resume"&&(await L({type:"RESUME_APPLY"}),b=!1,u())}),(n=document.getElementById("select-all"))==null||n.addEventListener("change",o=>{const l=o.target.checked,r=j().filter(p=>!p.alreadyApplied),c=new Set(f);l?r.forEach(p=>c.add(p.id)):r.forEach(p=>c.delete(p.id)),f=c,u()}),(a=document.getElementById("filter-input"))==null||a.addEventListener("input",o=>{g=o.target.value,$(),u()}),(s=document.getElementById("exclude-input"))==null||s.addEventListener("input",o=>{v=o.target.value,$(),u()})}function R(e){let t=document.getElementById("zhaopin-toggle-dot");e?(t||(t=document.createElement("div"),t.id="zhaopin-toggle-dot",t.style.cssText=`
        position: fixed; bottom: 20px; right: 20px; z-index: 2147483647;
        width: 40px; height: 40px; border-radius: 50%;
        background: linear-gradient(135deg, #4361ee, #3aafe6);
        box-shadow: 0 4px 16px rgba(67,97,238,0.4);
        cursor: pointer; display: flex; align-items: center; justify-content: center;
        font-size: 18px; color: #fff; transition: transform 0.2s;
      `,t.textContent="🤖",t.title="显示自动投递面板",t.addEventListener("click",()=>{k=!0;const i=document.getElementById(x);i&&(i.className=w?"minimized":""),R(!1)}),document.body.appendChild(t)),t.style.display="flex"):t&&(t.style.display="none")}async function M(){const e=K();document.body.appendChild(e),q(e),X(),V();try{const n=await chrome.runtime.sendMessage({type:"GET_STATE"});n!=null&&n.templates&&(E=n.templates,E.length>0&&(z=(E.find(s=>s.isDefault)||E[0]).id)),n!=null&&n.scannedJobs&&(y=n.scannedJobs),n!=null&&n.applyState&&(d=n.applyState,h=d.isRunning,b=d.isPaused,h||(I=!0)),u()}catch{}const t=document.getElementById("filter-input"),i=document.getElementById("exclude-input");t&&g&&(t.value=g),i&&v&&(i.value=v),console.log("[智联自动投递] 浮动面板已就绪")}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",M):M();
