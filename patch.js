const fs = require('fs');

// Fix css/app.css — swap EC to green, Free/Personal to grey
let css = fs.readFileSync('css/app.css', 'utf8');
css = css.replace('--ec:  #d97706; --ec-bg:  #fffbeb; --ec-bd:  #fcd34d;', '--ec:  #16a34a; --ec-bg:  #f0fdf4; --ec-bd:  #86efac;');
css = css.replace('--per: #16a34a; --per-bg: #f0fdf4; --per-bd: #86efac;', '--per: #6b7280; --per-bg: #f3f4f6; --per-bd: #d1d5db;');
css = css.replace('--ec-bg:rgba(217,119,6,.14); --ec-bd:rgba(217,119,6,.35);', '--ec-bg:rgba(22,163,74,.14); --ec-bd:rgba(22,163,74,.35);');
css = css.replace('--per-bg:rgba(22,163,74,.14); --per-bd:rgba(22,163,74,.35);', '--per-bg:rgba(107,114,128,.14); --per-bd:rgba(107,114,128,.35);');
// Fix schedule block EC color (hardcoded in .sb-ec)
css = css.replace('.sb-ec     {background:rgba(217,119,6,.14);border-color:rgba(217,119,6,.28);color:#92400e}', '.sb-ec     {background:rgba(22,163,74,.14);border-color:rgba(22,163,74,.28);color:#14532d}');
// Fix schedule block Free color (hardcoded in .sb-free — was green, now grey)
css = css.replace('.sb-free   {background:rgba(22,163,74,.14);border-color:rgba(22,163,74,.28);color:#14532d}', '.sb-free   {background:rgba(107,114,128,.14);border-color:rgba(107,114,128,.28);color:#374151}');
// Dark mode schedule block fixes
css = css.replace('.sb-ec     {background:rgba(217,119,6,.22);border-color:rgba(217,119,6,.4);color:#fcd34d}', '.sb-ec     {background:rgba(22,163,74,.22);border-color:rgba(22,163,74,.4);color:#86efac}');
css = css.replace('.sb-free   {background:rgba(22,163,74,.22);border-color:rgba(22,163,74,.4);color:#86efac}', '.sb-free   {background:rgba(107,114,128,.22);border-color:rgba(107,114,128,.4);color:#d1d5db}');
// Fix btype-btn selected states
css = css.replace('.btype-btn.sel.sb-ec{background:rgba(217,119,6,.1);border-color:var(--ec);color:#92400e}', '.btype-btn.sel.sb-ec{background:rgba(22,163,74,.1);border-color:var(--ec);color:#14532d}');
css = css.replace('.btype-btn.sel.sb-free{background:rgba(22,163,74,.1);border-color:var(--green);color:#14532d}', '.btype-btn.sel.sb-free{background:rgba(107,114,128,.1);border-color:#6b7280;color:#374151}');
fs.writeFileSync('css/app.css', css, 'utf8');
console.log('✅ css/app.css done');
