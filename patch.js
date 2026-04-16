const fs = require('fs');
let css = fs.readFileSync('css/app.css', 'utf8');
css = css.replace('--ec:  #d97706; --ec-bg:  #fffbeb; --ec-bd:  #fcd34d;', '--ec:  #16a34a; --ec-bg:  #f0fdf4; --ec-bd:  #86efac;');
css = css.replace('--per: #16a34a; --per-bg: #f0fdf4; --per-bd: #86efac;', '--per: #6b7280; --per-bg: #f3f4f6; --per-bd: #d1d5db;');
css = css.replace('--ec-bg:rgba(217,119,6,.14); --ec-bd:rgba(217,119,6,.35);', '--ec-bg:rgba(22,163,74,.14); --ec-bd:rgba(22,163,74,.35);');
css = css.replace('--per-bg:rgba(22,163,74,.14); --per-bd:rgba(22,163,74,.35);', '--per-bg:rgba(107,114,128,.14); --per-bd:rgba(107,114,128,.35);');
fs.writeFileSync('css/app.css', css, 'utf8');
console.log('Done');
