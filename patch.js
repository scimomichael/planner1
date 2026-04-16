const fs = require('fs');

// ── 1. CSS — the real fix ─────────────────────────────────
// The sched-wrap needs an explicit height so its absolute-
// positioned children (axis + scroller) have something to fill.
// We also override any old conflicting rules.
let css = fs.readFileSync('css/app.css', 'utf8');

// Remove any old scroll-related overrides we previously added
css = css.replace(/\/\* sched-scroll-fix \*\/[\s\S]*?\.tz-select:focus\{border-color:var\(--blue\)\}/g, '');
css = css.replace(/\/\* ── Schedule scroll fix[\s\S]*?\.sched-scroller::-webkit-scrollbar-thumb\{[^}]*\}/g, '');

// Replace the existing sched-wrap definition
css = css.replace(
  '.sched-wrap{\n  background:var(--surf);\n  border:1px solid var(--b1);\n  border-radius:var(--r-md);\n  overflow:hidden;\n  position:relative;\n}',
  '.sched-wrap{\n  background:var(--surf);\n  border:1px solid var(--b1);\n  border-radius:var(--r-md);\n  overflow:hidden;\n  position:relative;\n  height:calc(100vh - 320px);\n  min-height:400px;\n}'
);

// Also handle compact version (no newlines)
css = css.replace(
  '.sched-wrap{background:var(--surf);border:1px solid var(--b1);border-radius:var(--r-md);overflow:hidden;position:relative}',
  '.sched-wrap{background:var(--surf);border:1px solid var(--b1);border-radius:var(--r-md);overflow:hidden;position:relative;height:calc(100vh - 320px);min-height:400px}'
);

// Ensure the axis and scroller CSS is correct
// Remove old axis definition and re-add correctly
css = css.replace(/\.sched-axis\{[\s\S]*?z-index:\d;pointer-events:none;\}/g, '');
css = css.replace(/\.sched-axis\{[^}]*\}/g, '');

// Append all needed scroll CSS
const scrollCss = `
/* ── Schedule scroll (authoritative) ───────────────────── */
.sched-wrap{position:relative;overflow:hidden}
.sched-wrap.sched-full{height:calc(100vh - 220px);min-height:500px}
.sched-axis{
  position:absolute;top:0;left:0;bottom:0;width:68px;
  background:var(--surf2);border-right:1px solid var(--b0);
  z-index:3;pointer-events:none;overflow:hidden;
}
.sched-scroller{
  position:absolute;top:0;left:68px;right:0;bottom:0;
  overflow-y:scroll;overflow-x:hidden;
  scrollbar-width:thin;
  scrollbar-color:var(--b2) transparent;
}
.sched-scroller::-webkit-scrollbar{width:5px}
.sched-scroller::-webkit-scrollbar-track{background:transparent}
.sched-scroller::-webkit-scrollbar-thumb{background:var(--b2);border-radius:3px}
`;

if (!css.includes('Schedule scroll (authoritative)')) {
  css += scrollCss;
}

fs.writeFileSync('css/app.css', css, 'utf8');
console.log('✅ css/app.css');

// ── 2. index.html — remove any inline height styles ───────
let html = fs.readFileSync('index.html', 'utf8');

// Remove old inline heights we added before (let CSS handle it)
html = html.replace(' style="height:480px"', '');
html = html.replace(' style="height:600px"', '');

fs.writeFileSync('index.html', html, 'utf8');
console.log('✅ index.html (removed old inline heights)');

// ── 3. js/schedule.js — fix render to set wrap height ─────
let sched = fs.readFileSync('js/schedule.js', 'utf8');

// Remove old height-check code we added before
sched = sched.replace(
  /\/\/ Ensure fixed height so scroller can fill it\s*if \(!wrap\.style\.height[^}]+\}\s*/g,
  ''
);
sched = sched.replace(
  /\/\/ Fixed height wrapper[^\n]*\n[^\n]*\n[^\n]*\n[^\n]*\n[^\n]*\n/g,
  ''
);

// Remove old wrap.style.height line if present
sched = sched.replace(/\s*wrap\.style\.height = [^\n]+\n/g, '\n');

// Replace single rAF with double rAF for reliable scroll
// Pattern 1: scrollTo variable
sched = sched.replace(
  /requestAnimationFrame\(\(\) => \{\s*const now\s*=\s*new Date\(\);/,
  'requestAnimationFrame(() => requestAnimationFrame(() => {\n        const now = new Date();'
);
sched = sched.replace(
  /scroller\.scrollTop = Math\.max\(0, scrollTo\);\s*\}\);\s*\}/,
  'scroller.scrollTop = Math.max(0, scrollTo);\n      }));\n    }'
);

// Pattern 2: rawTop/half variables  
sched = sched.replace(
  /requestAnimationFrame\(\(\) => \{\s*const now\s*=\s*new Date\(\);\s*const nowM/,
  'requestAnimationFrame(() => requestAnimationFrame(() => {\n        const now = new Date();\n        const nowM'
);
sched = sched.replace(
  /scroller\.scrollTop = Math\.max\(0, rawTop - half\);\s*\}\);\s*\}/,
  'scroller.scrollTop = Math.max(0, rawTop - half);\n      }));\n    }'
);

// If we already have double rAF, don't double-wrap again
// (idempotent check)
sched = sched.replace(
  /requestAnimationFrame\(\(\) => requestAnimationFrame\(\(\) => requestAnimationFrame/g,
  'requestAnimationFrame(() => requestAnimationFrame'
);

fs.writeFileSync('js/schedule.js', sched, 'utf8');
console.log('✅ js/schedule.js');

console.log('\n✅ Done. Delete patch.js from your repo.');
