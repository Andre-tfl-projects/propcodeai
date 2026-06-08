/* Tankfarm Tech Guide — App Logic */

// ── Theme ─────────────────────────────────────────────────────
let theme = localStorage.getItem('tfTheme') || 'dark';
applyTheme(theme);

function applyTheme(t) {
  theme = t;
  document.documentElement.setAttribute('data-theme', t);
  document.getElementById('theme-btn').textContent = t === 'dark' ? '🌙' : '☀️';
  localStorage.setItem('tfTheme', t);
}

function toggleTheme() {
  applyTheme(theme === 'dark' ? 'light' : 'dark');
}

// ── State ─────────────────────────────────────────────────────
let selectedBook = 'ALL';
let busy = false;
let history = [];
let notes = JSON.parse(localStorage.getItem('tf_notes') || '[]');
let editId = null;

// ── Offline ───────────────────────────────────────────────────
function updateOnline() {
  document.getElementById('offline-pill').classList.toggle('show', !navigator.onLine);
}
window.addEventListener('online',  updateOnline);
window.addEventListener('offline', updateOnline);
updateOnline();

// ── Tab switching ─────────────────────────────────────────────
function switchTab(name) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('panel-' + name).classList.add('active');
  document.querySelector(`.nav-btn[data-tab="${name}"]`).classList.add('active');
  if (name === 'notes') renderNotes();
}

// ── Book filter ───────────────────────────────────────────────
document.getElementById('book-bar').addEventListener('click', e => {
  const chip = e.target.closest('.book-chip');
  if (!chip) return;
  document.querySelectorAll('.book-chip').forEach(c => c.classList.remove('on'));
  chip.classList.add('on');
  selectedBook = chip.dataset.book;
});

// ── Chat ──────────────────────────────────────────────────────
function resizeTxt(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 96) + 'px';
}

function onKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); }
}

function ask(text) {
  document.getElementById('txt').value = text;
  sendMsg();
}

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function addMsg(text, type) {
  const chat = document.getElementById('chat');
  if (type === 'user') {
    const d = document.createElement('div');
    d.className = 'msg user';
    d.innerHTML = `<div class="bubble">${esc(text)}</div>`;
    chat.appendChild(d);
  } else {
    const formatted = text
      .replace(/\[(NFPA\s*\d+[^\]]*|IFGC[^\]]*|IMC[^\]]*|IPC[^\]]*)\]/gi, '<span class="code-ref">$1</span>')
      .replace(/\n/g, '<br>');
    const d = document.createElement('div');
    d.className = 'msg bot';
    d.innerHTML = `<div class="bot-lbl">Tankfarm AI</div><div class="bubble">${formatted}</div>`;
    chat.appendChild(d);
  }
  chat.scrollTop = chat.scrollHeight;
}

function showDots() {
  const chat = document.getElementById('chat');
  const d = document.createElement('div');
  d.id = 'dots'; d.className = 'dots';
  d.innerHTML = '<span></span><span></span><span></span>';
  chat.appendChild(d);
  chat.scrollTop = chat.scrollHeight;
}

function hideDots() { const d = document.getElementById('dots'); if (d) d.remove(); }

async function sendMsg() {
  if (busy) return;
  const txt = document.getElementById('txt');
  const text = txt.value.trim();
  if (!text) return;

  const qs = document.getElementById('quick-section');
  if (qs) qs.style.display = 'none';

  addMsg(text, 'user');
  txt.value = ''; txt.style.height = 'auto';

  if (!navigator.onLine) {
    addMsg('You\'re offline. The AI needs internet. Tank Sizing, Pipe Sizing, Converter, and Notes all work offline!', 'bot');
    return;
  }

  busy = true;
  document.getElementById('send-btn').disabled = true;
  showDots();

  const bookLine = selectedBook !== 'ALL'
    ? `Focus on ${selectedBook} only.`
    : 'Reference NFPA 54, NFPA 58, IFGC, IMC, or IPC — whichever applies.';

  const system = `You are the Tankfarm Tech Guide AI, an expert assistant for LP and natural gas service technicians in the field.

Your knowledge covers:
- NFPA 58 (Liquefied Petroleum Gas Code)
- NFPA 54 (National Fuel Gas Code)
- IFGC (International Fuel Gas Code)
- IMC (International Mechanical Code)
- IPC (International Plumbing Code)

Rules:
1. Give the practical, field-ready answer first — then the code citation
2. Format citations like: [NFPA 58 §6.2.3] or [IFGC §404.1]
3. Keep answers under 200 words — techs are in the field
4. If a section number is uncertain, say so clearly — never invent one
5. Note if something varies by jurisdiction or code edition
6. Plain language only — no legal jargon

${bookLine}`;

  history.push({ role: 'user', content: text });

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ system, messages: history })
    });
    const data = await res.json();
    if (!res.ok) {
      hideDots();
      addMsg('⚠️ ' + (data.error || 'Error ' + res.status), 'bot');
      history.pop();
    } else {
      const reply = data.content?.[0]?.text || 'No response. Try again.';
      history.push({ role: 'assistant', content: reply });
      hideDots();
      addMsg(reply, 'bot');
    }
  } catch (e) {
    hideDots();
    addMsg('⚠️ Network error: ' + e.message, 'bot');
    history.pop();
  }

  busy = false;
  document.getElementById('send-btn').disabled = false;
}

// ── Pipe Sizing ───────────────────────────────────────────────
const PIPE_TABLES = {
  steel:  { name:'Schedule 40 Steel', code:'NFPA 54 Table 6.2(b) / IFGC Table 402.4(2)',
    sizes:[{nom:'1/2"',id:0.622,lp:75000,ng:32000},{nom:'3/4"',id:0.824,lp:175000,ng:72000},{nom:'1"',id:1.049,lp:345000,ng:143000},{nom:'1-1/4"',id:1.380,lp:750000,ng:310000},{nom:'1-1/2"',id:1.610,lp:1175000,ng:490000},{nom:'2"',id:2.067,lp:2300000,ng:950000}]},
  csst:   { name:'CSST', code:'NFPA 54 / Manufacturer tables (verify with mfr)',
    sizes:[{nom:'3/8"',id:0.375,lp:40000,ng:17000},{nom:'1/2"',id:0.500,lp:85000,ng:35000},{nom:'3/4"',id:0.750,lp:215000,ng:90000},{nom:'1"',id:1.000,lp:450000,ng:190000},{nom:'1-1/4"',id:1.250,lp:800000,ng:340000}]},
  copper: { name:'Copper Type L', code:'NFPA 54 Table 6.3 — ⚠️ NOT for LP in many jurisdictions',
    sizes:[{nom:'3/8"',id:0.430,lp:40000,ng:17000},{nom:'1/2"',id:0.545,lp:85000,ng:35000},{nom:'3/4"',id:0.785,lp:215000,ng:90000},{nom:'1"',id:1.025,lp:430000,ng:180000},{nom:'1-1/4"',id:1.265,lp:780000,ng:325000}]},
  pe:     { name:'PE/HDPE Underground', code:'NFPA 58 §5.11 / ASTM D2513 — Underground only',
    sizes:[{nom:'1/2"',id:0.622,lp:70000,ng:29000},{nom:'3/4"',id:0.824,lp:165000,ng:68000},{nom:'1"',id:1.049,lp:325000,ng:135000},{nom:'1-1/4"',id:1.380,lp:700000,ng:290000},{nom:'1-1/2"',id:1.610,lp:1100000,ng:460000},{nom:'2"',id:2.067,lp:2150000,ng:890000}]}
};

function lenFactor(ft) {
  if(ft<=10)return 1.40; if(ft<=20)return 1.20; if(ft<=30)return 1.10;
  if(ft<=50)return 1.00; if(ft<=75)return 0.88; if(ft<=100)return 0.80;
  if(ft<=150)return 0.70; if(ft<=200)return 0.63; if(ft<=300)return 0.54;
  return 0.46;
}

function calcPipe() {
  const gasType = document.getElementById('gas-type').value;
  const mat     = document.getElementById('pipe-mat').value;
  const btu     = parseFloat(document.getElementById('btu').value);
  const ft      = parseFloat(document.getElementById('runft').value);
  const errEl   = document.getElementById('pipe-err');
  const resEl   = document.getElementById('pipe-res');
  errEl.classList.add('hidden'); resEl.classList.add('hidden');

  if (!btu || btu <= 0) { errEl.textContent='Enter a BTU/hr load.'; errEl.classList.remove('hidden'); return; }
  if (!ft  || ft  <= 0) { errEl.textContent='Enter a run length.';  errEl.classList.remove('hidden'); return; }

  const tbl = PIPE_TABLES[mat];
  const lf  = lenFactor(ft);
  const needed = btu / lf;
  const minRow = tbl.sizes.find(s => s[gasType] >= needed);
  const recRow = tbl.sizes.find(s => s[gasType] >= needed * 1.25);

  if (!minRow) {
    errEl.textContent = `Load of ${btu.toLocaleString()} BTU/hr over ${ft} ft exceeds ${tbl.name} table capacity. Consider a larger distribution system or consult an engineer.`;
    errEl.classList.remove('hidden'); return;
  }

  const btuPerCf = gasType === 'lp' ? 2516 : 1020;
  const area = Math.PI * Math.pow(minRow.id/2, 2) / 144;
  const vel  = Math.round((btu / btuPerCf / 3600) / area);

  let note = `${ft} ft run · length factor ${lf.toFixed(2)} · adjusted load ${Math.round(needed).toLocaleString()} BTU/hr. `;
  note += gasType==='lp' ? 'Verify with locally adopted NFPA 58 and AHJ.' : 'Verify with locally adopted NFPA 54 / IFGC and AHJ.';
  if (mat==='copper') note += ' ⚠️ Copper not permitted for LP in many jurisdictions.';
  if (mat==='pe')     note += ' PE/HDPE for underground use only — NFPA 58 §5.11.';

  resEl.innerHTML = `<div class="result-box">
    <div class="result-hero"><span class="result-num">${(recRow||minRow).nom}</span><span class="result-lbl">${tbl.name}</span></div>
    <div class="result-row"><span class="rk">Recommended (w/ safety margin)</span><span class="rv">${(recRow||minRow).nom}</span></div>
    <div class="result-row"><span class="rk">Minimum acceptable</span><span class="rv">${minRow.nom}</span></div>
    <div class="result-row"><span class="rk">Max capacity at this run</span><span class="rv">${Math.round(minRow[gasType]*lf).toLocaleString()} BTU/hr</span></div>
    <div class="result-row"><span class="rk">Approx. gas velocity</span><span class="rv">${vel} ft/s${vel>50?' ⚠️ High':''}</span></div>
    <div class="result-row"><span class="rk">Code reference</span><span class="rv">${tbl.code}</span></div>
    <div class="result-note">${note}</div>
  </div>`;
  resEl.classList.remove('hidden');
  resEl.scrollIntoView({ behavior:'smooth', block:'nearest' });
}

// ── Tank Sizing ───────────────────────────────────────────────
function calcTank() {
  const btu     = parseFloat(document.getElementById('t-btu').value);
  const climate = document.getElementById('t-climate').value;
  const usage   = document.getElementById('t-usage').value;
  const refill  = document.getElementById('t-refill').value;
  const errEl   = document.getElementById('tank-err');
  const resEl   = document.getElementById('tank-res');
  errEl.classList.add('hidden'); resEl.classList.add('hidden');

  if (!btu || btu <= 0) {
    errEl.textContent = 'Please enter your total connected BTU/hr load.';
    errEl.classList.remove('hidden'); return;
  }

  // Vaporization capacity drops in cold weather — tank must be larger
  const climateFactors = { warm:1.0, moderate:1.3, cold:1.7, extreme:2.2 };
  const usageFactors   = { residential:1.0, commercial:1.2, standby:0.6, seasonal:0.7 };
  const refillDays     = { annual:365, semi:180, quarterly:90, monthly:30 };

  const cf   = climateFactors[climate];
  const uf   = usageFactors[usage];
  const days = refillDays[refill];

  // Adjusted peak demand
  const peakBtu = btu * cf;

  // LP vaporization from a standard tank (BTU/hr per gallon of liquid at temp)
  // Conservative estimate: 1 gal liquid LP ≈ 91,500 BTU; tank vaporization ~1,000-2,500 BTU/hr/gal at surface
  const vaporRatePerGal = climate === 'extreme' ? 800 : climate === 'cold' ? 1100 : climate === 'moderate' ? 1600 : 2200;

  // Minimum gallons for vaporization at peak
  const minGalVapor = Math.ceil(peakBtu / vaporRatePerGal);

  // Gallons for storage (days supply at 75% fill rule)
  const btuPerGalLP   = 91500;
  const dailyBtu      = btu * uf * 8; // assume 8 hrs/day avg usage
  const storageNeeded = Math.ceil((dailyBtu * days) / (btuPerGalLP * 0.80)); // 80% usable

  const minGal = Math.max(minGalVapor, storageNeeded);

  // Round up to standard sizes
  const stdSizes = [120, 250, 500, 1000, 1500, 2000, 3000, 5000, 10000];
  const minSize  = stdSizes.find(s => s >= minGal) || 10000;
  const recSize  = stdSizes.find(s => s >= minGal * 1.2) || 10000;

  // Setback distance per NFPA 58
  let setback = '10 ft from building';
  if (recSize > 2000) setback = '50 ft from building';
  else if (recSize > 500) setback = '25 ft from building';

  // Underground vs above ground
  const tankType = recSize <= 1000 ? 'Above ground or underground' : 'Above ground (consult AHJ for underground)';

  let note = `Based on ${btu.toLocaleString()} BTU/hr load · ${climate} climate · ${refill} refill cycle. `;
  note += 'Always verify tank sizing with NFPA 58 Table 5.2 and your local AHJ. ';
  note += 'Underground tanks require corrosion protection and may need permits.';

  resEl.innerHTML = `<div class="result-box">
    <div class="result-hero"><span class="result-num">${recSize.toLocaleString()}</span><span class="result-lbl">gallon tank</span></div>
    <div class="result-row"><span class="rk">Recommended size</span><span class="rv">${recSize.toLocaleString()} gallons</span></div>
    <div class="result-row"><span class="rk">Minimum size</span><span class="rv">${minSize.toLocaleString()} gallons</span></div>
    <div class="result-row"><span class="rk">Min. for vaporization</span><span class="rv">${minGalVapor} gal needed</span></div>
    <div class="result-row"><span class="rk">Min. for storage</span><span class="rv">${storageNeeded} gal needed</span></div>
    <div class="result-row"><span class="rk">Required setback</span><span class="rv">${setback}</span></div>
    <div class="result-row"><span class="rk">Tank placement</span><span class="rv">${tankType}</span></div>
    <div class="result-row"><span class="rk">Code reference</span><span class="rv">NFPA 58 §6.2, Table 6.2.2</span></div>
    <div class="result-note">${note}</div>
  </div>`;
  resEl.classList.remove('hidden');
  resEl.scrollIntoView({ behavior:'smooth', block:'nearest' });
}

// ── Unit Converter ────────────────────────────────────────────
let convLock = false;

function r(n, dec=4) {
  if (n === '' || n === null || isNaN(n)) return '';
  return parseFloat(Number(n).toFixed(dec));
}

function setVal(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = (val === '' || val === null) ? '' : r(val);
}

function convFrom(src) {
  if (convLock) return;
  convLock = true;

  const v = parseFloat(document.getElementById('c-' + src)?.value);
  if (isNaN(v)) { convLock = false; return; }

  // Pressure: psi ↔ wc ↔ kpa ↔ mbar
  if (['psi','wc','kpa','mbar'].includes(src)) {
    let psi;
    if (src==='psi')  psi = v;
    if (src==='wc')   psi = v / 27.7076;
    if (src==='kpa')  psi = v / 6.89476;
    if (src==='mbar') psi = v / 68.9476;
    if (src!=='psi')  setVal('c-psi',  psi);
    if (src!=='wc')   setVal('c-wc',   psi * 27.7076);
    if (src!=='kpa')  setVal('c-kpa',  psi * 6.89476);
    if (src!=='mbar') setVal('c-mbar', psi * 68.9476);
  }

  // Power: btu ↔ kw ↔ mbh
  if (['btu','kw','mbh'].includes(src)) {
    let btu;
    if (src==='btu') btu = v;
    if (src==='kw')  btu = v * 3412.14;
    if (src==='mbh') btu = v * 1000;
    if (src!=='btu') setVal('c-btu', btu);
    if (src!=='kw')  setVal('c-kw',  btu / 3412.14);
    if (src!=='mbh') setVal('c-mbh', btu / 1000);
  }

  // Temp: f ↔ c
  if (['f','c'].includes(src)) {
    if (src==='f') setVal('c-c', (v - 32) * 5/9);
    if (src==='c') setVal('c-f', v * 9/5 + 32);
  }

  // Gas flow: cfh-lp ↔ btu-lp ↔ cfh-ng ↔ btu-ng
  if (['cfh','btulp','cfhng','btung'].includes(src)) {
    let cfhLP;
    if (src==='cfh')    cfhLP = v;
    if (src==='btulp')  cfhLP = v / 2516;
    if (src==='cfhng')  cfhLP = v * (1020 / 2516); // rough ratio
    if (src==='btung')  cfhLP = (v / 1020) * (1020 / 2516);
    if (src!=='cfh')    setVal('c-cfh',   cfhLP);
    if (src!=='btulp')  setVal('c-btulp', cfhLP * 2516);
    if (src!=='cfhng')  setVal('c-cfhng', cfhLP * (2516 / 1020));
    if (src!=='btung')  setVal('c-btung', cfhLP * (2516 / 1020) * 1020);
  }

  convLock = false;
}

// ── Notes ─────────────────────────────────────────────────────
function saveNotes() { localStorage.setItem('tf_notes', JSON.stringify(notes)); }

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso), now = new Date(), diff = now - d;
  if (diff < 60000)   return 'Just now';
  if (diff < 3600000) return Math.floor(diff/60000) + 'm ago';
  if (diff < 86400000)return Math.floor(diff/3600000) + 'h ago';
  return d.toLocaleDateString('en-US', {month:'short', day:'numeric'});
}

function escN(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function renderNotes() {
  const q    = (document.getElementById('note-search').value || '').toLowerCase();
  const list = document.getElementById('notes-list');
  const f    = notes.filter(n => !q || n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q) || (n.tag||'').toLowerCase().includes(q));
  if (!f.length) {
    list.innerHTML = `<div class="empty"><div class="empty-icon">📋</div>${q ? 'No notes match.' : 'No notes yet.<br>Tap <strong>+ New</strong> to start.'}</div>`;
    return;
  }
  list.innerHTML = f.map(n => `
    <div class="note-card" onclick="openNote('${n.id}')">
      <div class="note-top"><div class="note-title">${escN(n.title||'Untitled')}</div><div class="note-date">${fmtDate(n.updated)}</div></div>
      <div class="note-preview">${escN(n.body||'')}</div>
      ${n.tag ? `<span class="note-tag">${escN(n.tag)}</span>` : ''}
    </div>`).join('');
}

function openEditor(note) {
  document.getElementById('ed-title').value = note?.title || '';
  document.getElementById('ed-body').value  = note?.body  || '';
  document.getElementById('ed-tag').value   = note?.tag   || '';
  document.getElementById('del-btn').style.display = note ? 'inline-block' : 'none';
  editId = note?.id || null;
  document.getElementById('notes-inner').classList.add('editing');
  document.getElementById('editor').classList.add('open');
  setTimeout(() => document.getElementById(note ? 'ed-body' : 'ed-title').focus(), 80);
}

function newNote()    { openEditor(null); }
function openNote(id) { openEditor(notes.find(n => n.id === id)); }

function closeEditor() {
  document.getElementById('notes-inner').classList.remove('editing');
  document.getElementById('editor').classList.remove('open');
  editId = null; renderNotes();
}

function saveNote() {
  const title = document.getElementById('ed-title').value.trim();
  const body  = document.getElementById('ed-body').value.trim();
  const tag   = document.getElementById('ed-tag').value;
  if (!title && !body) { closeEditor(); return; }
  if (editId) {
    const i = notes.findIndex(n => n.id === editId);
    if (i > -1) notes[i] = { ...notes[i], title, body, tag, updated: new Date().toISOString() };
  } else {
    notes.unshift({ id:'n'+Date.now(), title, body, tag, created:new Date().toISOString(), updated:new Date().toISOString() });
  }
  saveNotes(); closeEditor();
}

function delNote() {
  if (!editId || !confirm('Delete this note?')) return;
  notes = notes.filter(n => n.id !== editId);
  saveNotes(); closeEditor();
}

// ── Service Worker ────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(()=>{}));
}
