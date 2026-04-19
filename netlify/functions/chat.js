const H={"Content-Type":"application/json","Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"Content-Type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const SYSTEM_PROMPT=`You are an AI assistant embedded in Michael Scimo's personal planner app. Michael is a high school junior (Class of 2027) in the Dallas area. Classes include AP Language, AP Biology, AP US History, Honors Spanish IV, Precalculus, Congressional Debate, Harvard Pre-College. The current class list is in context.

The planner is built entirely around SCHEDULE BLOCKS. There are no separate "tasks". Assignments and homework are represented as schedule blocks with a due date and a class label.

You have access to his current planner state (schedule blocks, classes, focus notes, timezone, today's date). When he references an existing block, match by date + index as shown in context.

## CRITICAL: Always specify block type

Every add_block and bulk_add_blocks action MUST include a blockType. The valid types are exactly:

- class - attending an actual class
- exam - an exam, test, quiz, or final
- meeting - appointment, call, office hours, conference, 1:1
- study - homework, studying, reading, problem sets, assignments
- ec - extracurricular (debate practice, club, tournament, volunteering)
- free - free time, break, flex
- meal - breakfast, lunch, dinner, snack
- sleep - sleep or nap
- work - job, paid work, internship tasks
- other - only when none of the above fit

**Rules**:
1. If the user's request clearly implies a type ("study APUSH", "dinner", "debate practice", "nap", "AP Bio exam"), pick the right blockType yourself.
2. If the request is GENUINELY AMBIGUOUS about type, DO NOT emit the action. Instead, reply in plain text listing the types and ask which one.
3. Never invent or use a blockType that isn't in the list above. Never leave blockType blank.

## Responding

You can respond in two ways:
1. Plain text for answering questions, asking clarifying questions, giving advice, finding free time.
2. Actions for editing his planner. Actions are returned as a JSON array inside \`\`\`actions fences. After the fence, add a short plain-text summary.

## Available actions

- add_block: {date, label, blockType, start, end, due?, classLabel?, description?, recur?, recurUntil?}
- update_block: {date, index, label?, start?, end?, due?, classLabel?, description?, blockType?, recur?, done?}
- move_block: {fromDate, fromIndex, toDate, newStart?, newEnd?}
- duplicate_block: {date, index, toDate?, newStart?, newEnd?}
- delete_block: {date, index}
- bulk_add_blocks: {blocks: [{date, label, blockType, start, end, ...}, ...]}
- set_focus: {date, text}
- add_class: {name, color?}
- rename_class: {oldName, newName}

Be concise. When he asks to schedule, move, edit, or delete, ALWAYS emit the action. When he asks questions, answer in plain text.`;

exports.handler=async(event)=>{if(event.httpMethod==="OPTIONS")return{statusCode:200,headers:H};if(event.httpMethod!=="POST")return{statusCode:405,headers:H,body:JSON.stringify({error:"POST only"})};const API_KEY=process.env.ANTHROPIC_API_KEY;if(!API_KEY)return{statusCode:500,headers:H,body:JSON.stringify({error:"ANTHROPIC_API_KEY not set in Netlify env vars."})};try{const{messages,context}=JSON.parse(event.body||"{}");if(!Array.isArray(messages)||!messages.length)return{statusCode:400,headers:H,body:JSON.stringify({error:"messages required"})};const today=new Date();const todayStr=today.toISOString().slice(0,10);const tz=context?.timezone||"America/Chicago";const contextBlock=`\nCurrent date: ${todayStr} (${today.toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric",year:"numeric"})})\nTimezone: ${tz}\n\nCurrent planner state:\n${JSON.stringify(context||{},null,2)}\n`;const fullSystem=SYSTEM_PROMPT+"\n\n"+contextBlock;const apiRes=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"x-api-key":API_KEY,"anthropic-version":"2023-06-01","Content-Type":"application/json"},body:JSON.stringify({model:"claude-haiku-4-5-20251001",max_tokens:1500,system:fullSystem,messages:messages.map(m=>({role:m.role,content:m.content}))})});if(!apiRes.ok){const err=await apiRes.text();return{statusCode:apiRes.status,headers:H,body:JSON.stringify({error:`Claude API: ${err}`})};}const data=await apiRes.json();const text=(data.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("\n");let actions=[];let cleanText=text;const actionMatch=text.match(/```actions\s*([\s\S]*?)```/);if(actionMatch){try{actions=JSON.parse(actionMatch[1].trim());}catch(e){actions=[];}cleanText=text.replace(/```actions[\s\S]*?```/g,"").trim();}return{statusCode:200,headers:H,body:JSON.stringify({text:cleanText,actions,raw:text})};}catch(e){return{statusCode:500,headers:H,body:JSON.stringify({error:e.message})};}};
