/* Tankfarm Tech Guide — App Logic */

// ── Theme ─────────────────────────────────────────────────────
let theme = localStorage.getItem('tfTheme') || 'light';
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

// ── Natural Gas Pipe Sizing ───────────────────────────────────
// Based on NFPA 54 / IFGC Table 402.4 — Schedule 40 steel sizing tables
// Capacity values (BTU/hr) at 0.5" W.C. pressure drop, SG 0.60
// Adjusted for run length, pressure, and specific gravity

const NG_TABLES = {
  steel: {
    name: 'Schedule 40 Steel',
    code: 'NFPA 54 Table 6.2(a) / IFGC Table 402.4(1)',
    // [pipe nom size, inside dia, BTU/hr at 10ft, 20ft, 30ft, 50ft, 75ft, 100ft, 150ft, 200ft]
    sizes: [
      { nom:'1/2"',  id:0.622, caps:[132000, 92000, 73000, 56000, 45000, 38000, 30000, 26000] },
      { nom:'3/4"',  id:0.824, caps:[278000, 190000, 152000, 116000, 93000, 79000, 63000, 54000] },
      { nom:'1"',    id:1.049, caps:[520000, 360000, 285000, 218000, 175000, 149000, 118000, 102000] },
      { nom:'1-1/4"',id:1.380, caps:[1050000, 730000, 580000, 440000, 355000, 300000, 240000, 205000] },
      { nom:'1-1/2"',id:1.610, caps:[1600000, 1100000, 880000, 670000, 540000, 460000, 365000, 315000] },
      { nom:'2"',    id:2.067, caps:[3050000, 2100000, 1680000, 1280000, 1030000, 870000, 695000, 600000] },
    ]
  },
  csst: {
    name: 'CSST',
    code: 'NFPA 54 / Manufacturer sizing tables — verify with manufacturer',
    sizes: [
      { nom:'3/8"',  id:0.375, caps:[55000,  38000,  30000,  23000,  18000,  15000,  12000,  10000] },
      { nom:'1/2"',  id:0.500, caps:[120000, 83000,  66000,  50000,  40000,  34000,  27000,  23000] },
      { nom:'3/4"',  id:0.750, caps:[260000, 180000, 143000, 109000, 88000,  74000,  59000,  51000] },
      { nom:'1"',    id:1.000, caps:[490000, 340000, 270000, 205000, 165000, 140000, 111000, 96000] },
      { nom:'1-1/4"',id:1.250, caps:[870000, 600000, 478000, 364000, 293000, 248000, 197000, 170000] },
    ]
  },
  copper: {
    name: 'Copper Type L',
    code: 'NFPA 54 Table 6.3 / IFGC Table 402.4(3)',
    sizes: [
      { nom:'3/8"',  id:0.430, caps:[32000,  22000,  18000,  13000,  11000,  9000,   7000,   6000] },
      { nom:'1/2"',  id:0.545, caps:[73000,  50000,  40000,  31000,  25000,  21000,  17000,  14000] },
      { nom:'3/4"',  id:0.785, caps:[175000, 121000, 96000,  73000,  59000,  50000,  40000,  34000] },
      { nom:'1"',    id:1.025, caps:[350000, 241000, 192000, 146000, 117000, 100000, 79000,  68000] },
      { nom:'1-1/4"',id:1.265, caps:[630000, 435000, 346000, 263000, 212000, 180000, 143000, 123000] },
    ]
  }
};

// Run length buckets matching table columns
const NG_RUN_BUCKETS = [10, 20, 30, 50, 75, 100, 150, 200];

function getNGCapacity(sizes, runFt) {
  // Find the two closest run buckets and interpolate
  let idx = NG_RUN_BUCKETS.length - 1;
  for (let i = 0; i < NG_RUN_BUCKETS.length; i++) {
    if (runFt <= NG_RUN_BUCKETS[i]) { idx = i; break; }
  }
  return sizes.caps[idx];
}

function calcNGPipe() {
  const mat      = document.getElementById('ng-mat').value;
  const pressure = document.getElementById('ng-pressure').value;
  const sg       = parseFloat(document.getElementById('ng-sg').value);
  const btu      = parseFloat(document.getElementById('ng-btu').value);
  const runFt    = parseFloat(document.getElementById('ng-run').value);
  const drop     = document.getElementById('ng-drop').value;

  const errEl = document.getElementById('ng-err');
  const resEl = document.getElementById('ng-res');
  errEl.classList.add('hidden'); resEl.classList.add('hidden');

  if (!btu || btu <= 0)   { errEl.textContent = 'Please enter a BTU/hr load.'; errEl.classList.remove('hidden'); return; }
  if (!runFt || runFt <= 0) { errEl.textContent = 'Please enter a run length.';  errEl.classList.remove('hidden'); return; }

  const tbl = NG_TABLES[mat];

  // SG correction factor — tables based on SG 0.60
  // Capacity decreases as SG increases: factor = sqrt(0.60 / sg)
  const sgFactor = Math.sqrt(0.60 / sg);

  // Pressure drop correction — tables based on 0.5" W.C.
  // Capacity increases with higher allowed drop: factor = sqrt(drop / 0.5)
  const dropVal = drop === '0.5' ? 0.5 : drop === '1.0' ? 1.0 : 3.0;
  const dropFactor = Math.sqrt(dropVal / 0.5);

  // Medium/high pressure multiplier (higher system pressure = more capacity)
  const pressureFactor = pressure === 'low' ? 1.0 : pressure === 'med' ? 1.35 : 1.65;

  // Combined correction
  const corrFactor = sgFactor * dropFactor * pressureFactor;

  // Find minimum pipe size — apply correction to table capacity
  const minRow = tbl.sizes.find(s => {
    const cap = getNGCapacity(s, runFt) * corrFactor;
    return cap >= btu;
  });

  const recRow = tbl.sizes.find(s => {
    const cap = getNGCapacity(s, runFt) * corrFactor;
    return cap >= btu * 1.25; // 25% safety margin
  });

  if (!minRow) {
    errEl.textContent = `Load of ${btu.toLocaleString()} BTU/hr over ${runFt} ft exceeds ${tbl.name} table capacity. Consider upsizing to a larger distribution system or consult a licensed engineer.`;
    errEl.classList.remove('hidden'); return;
  }

  const minCap = Math.round(getNGCapacity(minRow, runFt) * corrFactor);
  const recCap = recRow ? Math.round(getNGCapacity(recRow, runFt) * corrFactor) : minCap;

  // Approx velocity
  const btuPerCf = 1020;
  const area = Math.PI * Math.pow(minRow.id / 2, 2) / 144;
  const vel  = Math.round((btu / btuPerCf / 3600) / area);

  const pressureLabel = pressure === 'low' ? 'Low (7" W.C.)' : pressure === 'med' ? 'Medium (2 PSI)' : 'High (5 PSI)';
  const dropLabel     = drop === '0.5' ? '0.5" W.C.' : drop === '1.0' ? '1.0" W.C.' : '3.0" W.C.';

  let note = `${runFt} ft run · SG ${sg} correction ${sgFactor.toFixed(3)} · drop correction ${dropFactor.toFixed(3)} · pressure factor ${pressureFactor.toFixed(2)}. `;
  note += 'Verify with your locally adopted edition of NFPA 54 / IFGC and AHJ. ';
  if (mat === 'csst') note += ' CSST sizing must be verified against manufacturer tables — values vary by brand.';

  resEl.innerHTML = `<div class="result-box">
    <div class="result-hero">
      <span class="result-num">${(recRow || minRow).nom}</span>
      <span class="result-lbl">${tbl.name}</span>
    </div>
    <div class="result-row"><span class="rk">Recommended (w/ 25% margin)</span><span class="rv">${(recRow || minRow).nom}</span></div>
    <div class="result-row"><span class="rk">Minimum acceptable</span><span class="rv">${minRow.nom}</span></div>
    <div class="result-row"><span class="rk">Capacity at this run</span><span class="rv">${minCap.toLocaleString()} BTU/hr</span></div>
    <div class="result-row"><span class="rk">System pressure</span><span class="rv">${pressureLabel}</span></div>
    <div class="result-row"><span class="rk">Allowable drop used</span><span class="rv">${dropLabel}</span></div>
    <div class="result-row"><span class="rk">Specific gravity</span><span class="rv">${sg}</span></div>
    <div class="result-row"><span class="rk">Approx gas velocity</span><span class="rv">${vel} ft/s${vel > 50 ? ' ⚠️ High' : ''}</span></div>
    <div class="result-row"><span class="rk">Code reference</span><span class="rv">${tbl.code}</span></div>
    <div class="result-note">${note}</div>
  </div>`;
  resEl.classList.remove('hidden');
  resEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ── Tank Sizing ───────────────────────────────────────────────
//
// Vaporization rates from NFPA 58 Table 5.2
// Values = BTU/hr vaporization capacity at 80% liquid fill level
// Keyed by tank size (gallons) and minimum ambient temperature (°F)
//
//                        +40°F    +20°F     0°F    -20°F
const NFPA58_T52 = {
   120: { 40: 105000,  20:  75000,   0:  42000,  '-20':  16000 },
   250: { 40: 190000,  20: 135000,   0:  75000,  '-20':  30000 },
   500: { 40: 315000,  20: 225000,   0: 125000,  '-20':  50000 },
  1000: { 40: 490000,  20: 350000,   0: 195000,  '-20':  78000 },
  1500: { 40: 630000,  20: 450000,   0: 250000,  '-20': 100000 },
  2000: { 40: 750000,  20: 535000,   0: 300000,  '-20': 120000 },
};

// Map climate selection to design temperature column
const CLIMATE_TEMP = {
  warm:     40,   // min ambient above +20°F — use +40°F column (conservative)
  moderate: 20,   // min ambient 0°F to +20°F
  cold:      0,   // min ambient -20°F to 0°F
  extreme: '-20'  // min ambient below -20°F
};

function getSetback(gal) {
  if (gal <= 500)  return '10 ft from building, 10 ft from ignition source';
  if (gal <= 2000) return '25 ft from building, 25 ft from ignition source';
  return '50 ft from building, 50 ft from ignition source';
}

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

  const tempKey  = CLIMATE_TEMP[climate];
  const stdSizes = [120, 250, 500, 1000, 1500, 2000];

  // ── Step 1: Find minimum SINGLE tank that meets vaporization demand ──
  // Using NFPA 58 Table 5.2 — find smallest tank whose vaporization rate >= load
  const singleTank = stdSizes.find(sz => NFPA58_T52[sz][tempKey] >= btu);

  // ── Step 2: Find minimum number of 120-gal tanks in parallel ──
  // Smallest standard tank; useful for standby or when large tank isn't practical
  const vap120     = NFPA58_T52[120][tempKey];
  const qty120     = Math.ceil(btu / vap120);

  // ── Step 3: Find minimum number of 250-gal tanks in parallel ──
  const vap250     = NFPA58_T52[250][tempKey];
  const qty250     = Math.ceil(btu / vap250);

  // ── Step 4: Storage — INFORMATIONAL ONLY, never overrides vaporization ──
  // Shows days of supply the chosen tank provides at average usage
  const btuPerGal     = 91500; // BTU per liquid gallon of LP
  const avgLoadFactor = 0.55;  // avg demand ~55% of connected peak
  const avgHrsPerDay  = { residential:8, commercial:12, standby:2, seasonal:6 };
  const refillDays    = { annual:365, semi:180, quarterly:90, monthly:30 };
  const hrs           = avgHrsPerDay[usage];
  const days          = refillDays[refill];

  // ── Step 5: Recommendation driven PURELY by vaporization (NFPA 58 Table 5.2) ──
  const recSingle = singleTank || null;

  // Build all valid options, then sort smallest total gallons first
  const allOptions = [];

  // Single tanks (120, 250, 500, 1000, 1500, 2000)
  for (const sz of stdSizes) {
    if (NFPA58_T52[sz][tempKey] >= btu) {
      allOptions.push({
        totalGal: sz,
        qty: 1,
        tankSize: sz,
        vapCap: NFPA58_T52[sz][tempKey],
        label: `1 × ${sz.toLocaleString()} gallon`,
        detail: `Vapor capacity: ${NFPA58_T52[sz][tempKey].toLocaleString()} BTU/hr at design temp`,
        setback: getSetback(sz),
        why: 'Single tank — simplest install'
      });
      break; // only need smallest single tank
    }
  }

  // Multiple 120-gal tanks (if qty is reasonable and total < next single tank size)
  if (qty120 >= 1 && qty120 <= 6) {
    const totalVap120 = qty120 * vap120;
    const totalGal120 = qty120 * 120;
    // Only show if it's actually smaller than the single-tank recommendation
    const singleRec = allOptions[0];
    if (!singleRec || totalGal120 < singleRec.totalGal) {
      allOptions.unshift({ // put at front — it's smaller!
        totalGal: totalGal120,
        qty: qty120,
        tankSize: 120,
        vapCap: totalVap120,
        label: `${qty120} × 120 gallon${qty120 > 1 ? 's' : ''}`,
        detail: `Combined vapor: ${totalVap120.toLocaleString()} BTU/hr at design temp`,
        setback: getSetback(120),
        why: qty120 === 1 ? 'Smallest standard tank — meets this load' : `${qty120} tanks manifolded — smaller footprint, shorter setbacks than a single large tank`
      });
    } else if (totalGal120 !== (singleRec?.totalGal || 0)) {
      allOptions.push({ // add as alternative
        totalGal: totalGal120,
        qty: qty120,
        tankSize: 120,
        vapCap: totalVap120,
        label: `${qty120} × 120 gallon${qty120 > 1 ? 's' : ''}`,
        detail: `Combined vapor: ${totalVap120.toLocaleString()} BTU/hr at design temp`,
        setback: getSetback(120),
        why: qty120 === 1 ? 'Smallest standard tank' : `${qty120} tanks manifolded — shorter setbacks, flexible placement`
      });
    }
  }

  // Multiple 250-gal tanks if different result and reasonable
  if (qty250 >= 1 && qty250 <= 4) {
    const totalGal250 = qty250 * 250;
    const already = allOptions.some(o => o.totalGal === totalGal250);
    if (!already) {
      allOptions.push({
        totalGal: totalGal250,
        qty: qty250,
        tankSize: 250,
        vapCap: qty250 * vap250,
        label: `${qty250} × 250 gallon${qty250 > 1 ? 's' : ''}`,
        detail: `Combined vapor: ${(qty250 * vap250).toLocaleString()} BTU/hr at design temp`,
        setback: getSetback(250),
        why: qty250 === 1 ? '250-gal single tank' : `${qty250} × 250-gal manifolded`
      });
    }
  }

  // If nothing meets demand (load > all table values)
  if (allOptions.length === 0) {
    allOptions.push({
      totalGal: 9999,
      label: 'Multiple large tanks required',
      detail: 'Load exceeds NFPA 58 Table 5.2 single-tank capacity at this temperature.',
      setback: getSetback(2000),
      why: 'Consult a licensed engineer — manifolded 2,000+ gal tanks required'
    });
  }

  // Sort by total gallons ascending — smallest first = recommended
  allOptions.sort((a, b) => a.totalGal - b.totalGal);

  // Deduplicate
  const seen = new Set();
  const options = allOptions.filter(o => {
    if (seen.has(o.label)) return false;
    seen.add(o.label);
    return true;
  }).slice(0, 4); // max 4 options

  // ── Temp label ──
  const tempLabels = { 40:'+40°F', 20:'+20°F', 0:'0°F', '-20':'-20°F' };
  const tempLabel  = tempLabels[tempKey];

  // ── Build result HTML ──
  const optionsHtml = options.map((o, i) => `
    <div style="background:${i===0?'rgba(0,119,200,0.1)':'var(--card)'}; border:1px solid ${i===0?'rgba(0,119,200,0.35)':'var(--border)'}; border-radius:12px; padding:13px 14px; margin-bottom:10px;">
      <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
        ${i===0 ? '<span style="font-size:10px;font-weight:700;background:#0077C8;color:#fff;border-radius:4px;padding:2px 7px;">RECOMMENDED</span>' : `<span style="font-size:10px;font-weight:700;color:var(--text3);">OPTION ${i+1}</span>`}
      </div>
      <div style="font-size:22px;font-weight:800;color:${i===0?'#0077C8':'var(--text)'};letter-spacing:-0.02em;margin-bottom:4px;">${o.label}</div>
      <div style="font-size:12px;color:var(--text2);margin-bottom:4px;">${o.detail}</div>
      <div style="font-size:11px;color:var(--text3);">📐 Setback: ${o.setback}</div>
      <div style="font-size:11px;color:var(--text3);margin-top:2px;">💡 ${o.why}</div>
    </div>`).join('');

  resEl.innerHTML = `
    <div class="result-box">
      <div class="result-hero">
        <span style="font-size:32px;font-weight:800;color:#0077C8;letter-spacing:-0.02em;line-height:1;">${btu.toLocaleString()}</span>
        <span class="result-lbl">BTU/hr @ ${tempLabel}</span>
      </div>
      <div class="result-row"><span class="rk">Design temperature used</span><span class="rv">${tempLabel} (${climate} climate)</span></div>
      <div class="result-row"><span class="rk">Est. days supply (${recSingle || 120} gal @ ${days}-day cycle)</span><span class="rv">${recSingle ? Math.floor((recSingle * 0.80 * btuPerGal) / (btu * avgLoadFactor * hrs)) : '—'} days</span></div>
      <div class="result-row"><span class="rk">Sizing basis</span><span class="rv">NFPA 58 Table 5.2 vaporization</span></div>
    </div>
    <div style="margin-bottom:8px;font-size:10px;font-weight:700;color:var(--text3);letter-spacing:0.08em;text-transform:uppercase;">Tank Options — Smallest First</div>
    ${optionsHtml}
    <div class="result-note">⚠️ Vaporization rates from NFPA 58 Table 5.2 at 80% fill. Always verify with locally adopted edition and your AHJ. Underground tanks and high-pressure systems may require additional engineering review.</div>`;

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
