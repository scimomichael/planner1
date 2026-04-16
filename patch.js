const fs = require('fs');

// ── 1. Patch js/schedule.js — fix scroll ─────────────────
let sched = fs.readFileSync('js/schedule.js', 'utf8');

// Ensure wrap gets an explicit height before building scroller
const oldPos = `    wrap.style.position = 'relative';`;
const newPos = `    wrap.style.position = 'relative';
    if (!wrap.style.height || wrap.style.height === '' || wrap.style.height === 'auto') {
      wrap.style.height = (gridId === 'schedGrid') ? '480px' : '600px';
    }`;
if (sched.includes(oldPos) && !sched.includes('480px')) {
  sched = sched.replace(oldPos, newPos);
  console.log('✅ height fallback added');
}

// Fix auto-scroll: use double rAF so clientHeight is accurate after layout
if (sched.includes('requestAnimationFrame(() => {') && !sched.includes('requestAnimationFrame(() => requestAnimationFrame')) {
  sched = sched.replace(
    'requestAnimationFrame(() => {',
    'requestAnimationFrame(() => requestAnimationFrame(() => {'
  );
  // Close the extra wrapper — find the scrollTop line and add extra closing
  sched = sched.replace(
    'scroller.scrollTop = Math.max(0, scrollTo);
      });',
    'scroller.scrollTop = Math.max(0, scrollTo);
      }));'
  );
  console.log('✅ double rAF applied');
}

// Same for the pattern with rawTop/half variable names
if (sched.includes('requestAnimationFrame(() => {') && !sched.includes('requestAnimationFrame(() => requestAnimationFrame')) {
  sched = sched.replace(
    'requestAnimationFrame(() => {',
    'requestAnimationFrame(() => requestAnimationFrame(() => {'
  );
  sched = sched.replace(
    'scroller.scrollTop = Math.max(0, rawTop - half);
      });',
    'scroller.scrollTop = Math.max(0, rawTop - half);
      }));'
  );
  console.log('✅ double rAF applied (rawTop pattern)');
}

fs.writeFileSync('js/schedule.js', sched, 'utf8');
console.log('✅ js/schedule.js');

// ── 2. Patch css/app.css ──────────────────────────────────
let css = fs.readFileSync('css/app.css', 'utf8');
if (!css.includes('sched-scroll-fix')) {
  // Remove any conflicting .sched-wrap overflow rules first
  css = css.replace('.sched-wrap{overflow:hidden}', '');
  css = css.replace('.sched-wrap{overflow:hidden;position:relative}', '');
  css += "\n/* sched-scroll-fix */\n.sched-wrap{position:relative;overflow:hidden}\n.sched-axis{\n  position:absolute;top:0;left:0;width:68px;\n  background:var(--surf2);border-right:1px solid var(--b0);\n  z-index:3;pointer-events:none;\n}\n.sched-scroller{\n  position:absolute;top:0;left:68px;right:0;bottom:0;\n  overflow-y:auto;overflow-x:hidden;\n  scrollbar-width:thin;\n  scrollbar-color:var(--b2) transparent;\n}\n.sched-scroller::-webkit-scrollbar{width:4px}\n.sched-scroller::-webkit-scrollbar-track{background:transparent}\n.sched-scroller::-webkit-scrollbar-thumb{background:var(--b2);border-radius:2px}\n";
  fs.writeFileSync('css/app.css', css, 'utf8');
  console.log('✅ css/app.css scroll styles');
} else {
  console.log('⏭  css already patched');
}

// ── 3. Patch index.html — add explicit height to sched boxes ─
let html = fs.readFileSync('index.html', 'utf8');
let changed = false;
if (!html.includes('schedGrid" class="sched-wrap" style=') && !html.includes('schedGrid" class="sched-wrap sched')) {
  html = html.replace(
    '<div id="schedGrid" class="sched-wrap"></div>',
    '<div id="schedGrid" class="sched-wrap" style="height:480px"></div>'
  );
  changed = true;
}
if (!html.includes('schedFullGrid" class="sched-wrap sched-full" style=')) {
  html = html.replace(
    '<div id="schedFullGrid" class="sched-wrap sched-full"></div>',
    '<div id="schedFullGrid" class="sched-wrap sched-full" style="height:600px"></div>'
  );
  changed = true;
}
if (changed) {
  fs.writeFileSync('index.html', html, 'utf8');
  console.log('✅ index.html heights added');
} else {
  console.log('⏭  index.html already has heights');
}

console.log('\n✅ Done. Delete patch.js from your repo.');
