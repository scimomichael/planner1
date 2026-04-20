// Calendar subscription sync module
const Cal=(()=>{
async function syncSub(sub){
  if(!sub||!sub.url)return;
  try{
    const res=await fetch('/api/ical',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:sub.url})});
    if(!res.ok){Store.toast('Sync failed: '+res.status);return;}
    const data=await res.json();
    if(!data.events||!Array.isArray(data.events)){Store.toast('No events found');return;}
    const todayStr=Store.todayStr();
    let added=0,skipped=0;
    for(const ev of data.events){
      if(!ev.date||!ev.start)continue;
      // Skip past events (before today)
      if(ev.date<todayStr)continue;
      const uid=ev.uid||`${sub.id}_${ev.date}_${ev.start}`;
      // Skip tombstoned (user-deleted) events
      if(Store.isCalTombstoned(uid)){skipped++;continue;}
      // Check if already exists
      const existing=(Store.schedule[ev.date]||[]);
      const alreadyExists=existing.some(b=>b.importUid===uid);
      if(alreadyExists){
        // Don't overwrite user-edited blocks
        const idx=existing.findIndex(b=>b.importUid===uid);
        if(idx>=0&&existing[idx].userEdited){skipped++;continue;}
        // Update in place (non-user-edited)
        existing[idx]={...existing[idx],label:ev.summary||'Event',start:ev.start,end:ev.end||ev.start,description:ev.description||existing[idx].description,location:ev.location||existing[idx].location};
        skipped++;continue;
      }
      // Add new
      const type=sub.defaultType||'other';
      const css=Sched.getBlockTypes().find(t=>t.id===type)?.css||'sb-other';
      if(!Store.schedule[ev.date])Store.schedule[ev.date]=[];
      Store.schedule[ev.date].push({label:ev.summary||'Event',type,css,start:ev.start,end:ev.end||ev.start,due:null,classLabel:'',description:ev.description||'',storedTz:Sched.getLocalTz(),recur:null,recurUntil:null,done:false,importUid:uid,importSubId:sub.id,userEdited:false,location:ev.location||'',link:'',priority:'',status:'scheduled'});
      added++;
    }
    Store.updateCalSub(sub.id,{lastSync:Date.now()});
    Store.persist();
    if(typeof App!=='undefined')App.refresh();
    Store.toast(`Synced ${sub.name}: ${added} added, ${skipped} unchanged`);
  }catch(e){Store.toast('Calendar sync error: '+e.message);}
}
async function syncAll(){
  for(const sub of Store.getCalSubs()){await syncSub(sub);}
}
return{syncSub,syncAll};
})();
