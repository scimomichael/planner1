const AI=(()=>{let history=[];const WELCOME={role:'assistant',content:"Hi Michael! Tell me what to add, move, or find. What type of block, what day and time, which class, and any details you want included."};function init(){history=[WELCOME];renderMessages();const bubble=document.getElementById('aiBubble');if(bubble)bubble.style.display=Settings.get('sAIEnabled',true)?'':'none';}function _clearHistory(){history=[WELCOME];renderMessages();}function toggle(){const panel=document.getElementById('aiPanel');const wasOpen=panel.classList.contains('open');_clearHistory();panel.classList.toggle('open');if(!wasOpen){setTimeout(()=>{const body=document.getElementById('aiMessages');if(body)body.scrollTop=body.scrollHeight;const input=document.getElementById('aiInput');if(input)input.focus();},100);}}function renderMessages(){const body=document.getElementById('aiMessages');if(!body)return;body.innerHTML=history.map(m=>{if(m.role==='user')return`<div class="ai-msg user">${Store.esc(m.content)}</div>`;const actionNote=m.actionsApplied?`<div class="ai-msg-actions"><strong>\u2713 Applied ${m.actionsApplied} change${m.actionsApplied===1?'':'s'}</strong> to your planner</div>`:'';return`<div class="ai-msg assistant">${_formatMarkdown(m.content)}${actionNote}</div>`;}).join('');body.scrollTop=body.scrollHeight;}function _formatMarkdown(text){let t=Store.esc(text);t=t.replace(/```(\w*)\n([\s\S]*?)```/g,'<pre style="font-family:var(--mono);background:rgba(0,0,0,.06);padding:8px 10px;border-radius:6px;font-size:.85em;overflow-x:auto;margin:4px 0">$2</pre>');t=t.replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>');t=t.replace(/\*(.+?)\*/g,'<em>$1</em>');t=t.replace(/`(.+?)`/g,'<code style="font-family:var(--mono);background:rgba(0,0,0,.06);padding:1px 5px;border-radius:4px;font-size:.9em">$1</code>');t=t.replace(/\n/g,'<br>');return t;}function handleKey(e){if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send();}}async function send(){const input=document.getElementById('aiInput');const text=input.value.trim();if(!text)return;input.value='';input.style.height='auto';history.push({role:'user',content:text});renderMessages();const body=document.getElementById('aiMessages');const typing=document.createElement('div');typing.className='ai-msg typing';typing.innerHTML='<div class="ai-typing-dot"></div><div class="ai-typing-dot"></div><div class="ai-typing-dot"></div>';body.appendChild(typing);body.scrollTop=body.scrollHeight;const sendBtn=document.querySelector('.ai-send');if(sendBtn)sendBtn.disabled=true;try{const ctx=_buildContext();const msgsForApi=history.filter(m=>m.role==='user'||m.role==='assistant').slice(-12);const res=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages:msgsForApi,context:ctx})});typing.remove();if(!res.ok){const err=await res.json().catch(()=>({error:'Unknown error'}));history.push({role:'assistant',content:`\u26a0\ufe0f ${err.error||'Something went wrong'}. Make sure your Anthropic API key is set in Netlify env vars as ANTHROPIC_API_KEY.`});renderMessages();return;}const data=await res.json();const actionsApplied=Array.isArray(data.actions)&&data.actions.length?executeActions(data.actions):0;history.push({role:'assistant',content:data.text||'(no response)',actionsApplied});renderMessages();if(actionsApplied>0)App.refresh();}catch(err){typing.remove();history.push({role:'assistant',content:`\u26a0\ufe0f Connection error: ${err.message||err}`});renderMessages();}finally{if(sendBtn)sendBtn.disabled=false;}}function _buildContext(){
  const today=Store.todayStr();
  // FULL schedule -- every date, past and future. The AI previously only saw
  // yesterday through +21 days, which made it blind to overdue assignments
  // sitting on older dates (Stats scans everything; the AI must too).
  // Null/empty fields are stripped per block to keep the payload compact.
  const _compact=(b,i)=>{
    const o={index:i,label:b.label||'',type:b.type||'other',start:b.start||null,end:b.end||null};
    if(b.classLabel)o.classLabel=b.classLabel;
    if(b.due)o.due=b.due;
    if(b.dueTime)o.dueTime=b.dueTime;
    if(b.dueInClass)o.dueInClass=true;
    if(b.description)o.description=b.description;
    if(b.recur&&b.recur!=='none')o.recur=b.recur;
    if(b.recurUntil)o.recurUntil=b.recurUntil;
    if(b.done)o.done=true;
    if(b.status&&b.status!=='scheduled')o.status=b.status;
    if(b.priority)o.priority=b.priority;
    if(b.location)o.location=b.location;
    if(b.link)o.link=b.link;
    if(b.overlay)o.overlay=true;
    if(b.storedTz&&b.storedTz!==Sched.getLocalTz())o.storedTz=b.storedTz;
    if(b.doneOverrides&&Object.keys(b.doneOverrides).length)o.doneOverrides=b.doneOverrides;
    return o;
  };
  const sched={};
  Object.keys(Store.schedule).sort().forEach(dk=>{
    const list=Store.schedule[dk]||[];
    if(list.length)sched[dk]=list.map(_compact);
  });
  // Computed aggregates -- the same numbers the Stats page shows, precomputed
  // so the AI never has to derive them (and can act on them directly).
  const overdueAssignments=[];
  const dueSoon=[];
  let withDue=0,completedWithDue=0;
  Object.keys(Store.schedule).forEach(dk=>{
    (Store.schedule[dk]||[]).forEach((b,i)=>{
      if(!b.due)return;
      withDue++;
      if(b.done){completedWithDue++;return;}
      const n=Store.daysUntil(b.due);
      if(n===null)return;
      if(n<0)overdueAssignments.push({date:dk,index:i,label:b.label||'',classLabel:b.classLabel||null,due:b.due,daysOverdue:-n});
      else if(n<=7)dueSoon.push({date:dk,index:i,label:b.label||'',classLabel:b.classLabel||null,due:b.due,daysUntilDue:n});
    });
  });
  overdueAssignments.sort((a,b)=>b.daysOverdue-a.daysOverdue);
  dueSoon.sort((a,b)=>a.daysUntilDue-b.daysUntilDue);
  let totalBlocks=0;Object.values(Store.schedule).forEach(l=>totalBlocks+=l.length);
  const allDates=Object.keys(sched).sort();
  const summary={
    totalBlocks,
    scheduleDateRange:allDates.length?{first:allDates[0],last:allDates[allDates.length-1]}:null,
    blocksToday:(Store.schedule[today]||[]).length,
    assignments:{withDue,completed:completedWithDue,overdue:overdueAssignments.length,dueWithin7Days:dueSoon.length},
    overdueAssignments,
    dueSoon,
  };
  const _tz=Sched.getLocalTz();
  const _fmtLocal=ts=>{try{return new Intl.DateTimeFormat('en-US',{timeZone:_tz,year:'numeric',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',hour12:true}).format(new Date(ts))+' '+_tz;}catch{return new Date(ts).toISOString();}};
  const recentChanges=(Store.getChangeLog?Store.getChangeLog({limit:60}):[]).map(e=>({ts:e.ts,local:_fmtLocal(e.ts),type:e.type,source:e.source||'manual',summary:e.summary||'',date:e.date||null,fromDate:e.fromDate||null,toDate:e.toDate||null,diff:e.diff||null,snapshot:e.snapshot||null}));
  // Everything else that exists on the planner, so the AI is never blind:
  const templates=(Store.getTemplates?Store.getTemplates():[]).map(t=>({name:t.name||t.label||'',blockCount:Array.isArray(t.blocks)?t.blocks.length:undefined}));
  const calendarSubscriptions=(Store.getCalSubs?Store.getCalSubs():[]).map(s=>({name:s.name||'',lastSync:s.lastSync||null,enabled:s.enabled!==false}));
  const settingsSnapshot={dayStartsAt:Number(Settings.get('sStartHour',5)),weekStart:Number(Settings.get('sWeekStart',0)),theme:Settings.get('sTheme','auto'),conflictWarnings:!!Settings.get('sConflictWarn',true)};
  let dailyAffirmation=null;
  try{const a=JSON.parse(localStorage.getItem('pl3_affirm_today'));if(a&&a.date===today)dailyAffirmation=a.text;}catch{}
  return{
    today,
    timezone:_tz,
    schedule:sched,
    summary,
    classes:Store.getClasses().map(c=>({name:c.name,color:c.color})),
    blockTypes:Sched.getBlockTypes().map(t=>t.id),
    templates,
    calendarSubscriptions,
    settings:settingsSnapshot,
    dailyAffirmation,
    recentChanges,
  };
}
function executeActions(actions){let applied=0;if(Store.setChangeSource)Store.setChangeSource('ai');try{Store.snapshot();for(const a of actions){try{switch(a.type){case'add_block':{if(!a.date||!a.start)break;const blockType=a.blockType||a.type_hint||'study';const css=Sched.getBlockTypes().find(t=>t.id===blockType)?.css||'sb-other';Sched.addBlock(a.date,{label:a.label||blockType,type:blockType,css,start:a.start,end:a.end||a.start,due:a.due||null,dueTime:a.dueTime||'',dueInClass:!!a.dueInClass,classLabel:a.classLabel||'',description:a.description||'',storedTz:Sched.getLocalTz(),recur:a.recur||null,recurUntil:a.recurUntil||null,priority:a.priority||'',reminder:a.reminder||null,location:a.location||'',link:a.link||'',status:'scheduled',done:false});applied++;break;}case'update_block':{const list=Store.schedule[a.date];if(list&&list[a.index]){const b={...list[a.index]};['label','start','end','due','dueTime','dueInClass','classLabel','description','recur','recurUntil','done','priority','reminder','location','link','status'].forEach(k=>{if(a[k]!==undefined)b[k]=a[k];});if(a.blockType){b.type=a.blockType;b.css=Sched.getBlockTypes().find(t=>t.id===a.blockType)?.css||'sb-other';}Sched.updateBlock(a.date,a.index,b);applied++;}break;}case'move_block':{const list=Store.schedule[a.fromDate];if(list&&list[a.fromIndex]){const b={...list[a.fromIndex]};if(a.newStart)b.start=a.newStart;if(a.newEnd)b.end=a.newEnd;Sched.removeBlock(a.fromDate,a.fromIndex);if(a.toDate)Sched.addBlock(a.toDate,b);applied++;}break;}case'delete_block':{const list=Store.schedule[a.date];if(list&&list[a.index]!==undefined){Sched.removeBlock(a.date,a.index);applied++;}break;}case'set_focus':{break;}case'add_class':{if(a.name){Store.addClass(a.name,a.color||'#8e8e93');applied++;}break;}case'rename_class':{const c=Store.getClasses().find(x=>x.name===a.oldName);if(c&&a.newName){Store.updateClass(c.id,{name:a.newName});applied++;}break;}case'duplicate_block':{const list=Store.schedule[a.date];if(list&&list[a.index]){const src=list[a.index];const copy=JSON.parse(JSON.stringify(src));copy.done=false;delete copy._recurFrom;delete copy._recurBaseIdx;const targetDate=a.toDate||a.date;if(a.newStart)copy.start=a.newStart;if(a.newEnd)copy.end=a.newEnd;Sched.addBlock(targetDate,copy);applied++;}break;}case'bulk_add_blocks':{if(Array.isArray(a.blocks)){for(const b of a.blocks){if(!b.date||!b.start)continue;const blockType=b.blockType||b.type||'study';const css=Sched.getBlockTypes().find(t=>t.id===blockType)?.css||'sb-other';Sched.addBlock(b.date,{label:b.label||blockType,type:blockType,css,start:b.start,end:b.end||b.start,due:b.due||null,dueTime:b.dueTime||'',dueInClass:!!b.dueInClass,classLabel:b.classLabel||'',description:b.description||'',storedTz:Sched.getLocalTz(),recur:b.recur||null,recurUntil:b.recurUntil||null,priority:b.priority||'',reminder:b.reminder||null,location:b.location||'',link:b.link||'',status:'scheduled',done:false});applied++;}}break;}}}catch(e){console.error('AI action failed:',a,e);}}if(applied>0)Store.persist();return applied;}finally{if(Store.setChangeSource)Store.setChangeSource('manual');}}document.addEventListener('input',e=>{if(e.target&&e.target.id==='aiInput'){e.target.style.height='auto';e.target.style.height=Math.min(e.target.scrollHeight,120)+'px';}});return{init,toggle,send,handleKey,renderMessages,executeActions};})();
