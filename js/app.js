/* PropCode AI — App Logic v2 */

// ── State ─────────────────────────────────────────────────────
let selectedBook = 'ALL';
let busy = false;
let history = [];
let notes = JSON.parse(localStorage.getItem('pcai_notes') || '[]');
let editId = null;

// ── Offline badge ─────────────────────────────────────────────
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

// ── Chat helpers ──────────────────────────────────────────────
function resize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 100) + 'px';
}

function onKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); }
}

function ask(text) {
  document.getElementById('txt').value = text;
  sendMsg();
}

function addMsg(text, type) {
  const chat = document.getElementById('chat');

  if (type === 'user') {
    const div = document.createElement('div');
    div.className = 'msg user';
    div.innerHTML = `<div class="bubble">${esc(text)}</div>`;
    chat.appendChild(div);
  } else {
    // Format bot message: turn [CODE §x.x] patterns into styled chips
    const formatted = text
      .replace(/\[(NFPA\s*\d+[^\]]*|IFGC[^\]]*|IMC[^\]]*|IPC[^\]]*)\]/gi,
        '<span class="code-ref">$1</span>')
      .replace(/\n/g, '<br>');
    const div = document.createElement('div');
    div.className = 'msg bot';
    div.innerHTML = `<div class="bot-label">PropCode AI</div><div class="bubble">${formatted}</div>`;
    chat.appendChild(div);
  }

  chat.scrollTop = chat.scrollHeight;
}

function showDots() {
  const chat = document.getElementById('chat');
  const d = document.createElement('div');
  d.id = 'dots';
  d.className = 'dots';
  d.innerHTML = '<span></span><span></span><span></span>';
  chat.appendChild(d);
  chat.scrollTop = chat.scrollHeight;
}

function hideDots() {
  const d = document.getElementById('dots');
  if (d) d.remove();
}

function esc(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Send message ──────────────────────────────────────────────
async function sendMsg() {
  if (busy) return;
  const txt = document.getElementById('txt');
  const text = txt.value.trim();
  if (!text) return;

  // Hide quick questions after first send
  const qs = document.getElementById('quick-section');
  if (qs) qs.style.display = 'none';

  addMsg(text, 'user');
  txt.value = '';
  txt.style.height = 'auto';

  if (!navigator.onLine) {
    addMsg('You\'re offline. The AI assistant needs an internet connection. Pipe Sizing and Notes work offline!', 'bot');
    return;
  }

  busy = true;
  document.getElementById('send-btn').disabled = true;
  showDots();

  const bookLine = selectedBook !== 'ALL'
    ? `Focus your answer on ${selectedBook} only.`
    : 'Reference NFPA 54, NFPA 58, IFGC, IMC, or IPC — whichever applies.';

  const system = `You are PropCode AI, an expert assistant for propane and natural gas service technicians in the field.

Your knowledge covers:
- NFPA 58 (Liquefied Petroleum Gas Code)
- NFPA 54 (National Fuel Gas Code)
- IFGC (International Fuel Gas Code)
- IMC (International Mechanical Code)
- IPC (International Plumbing Code)

Rules:
1. Give the practical, field-ready answer first — then cite the code
2. Format code citations like: [NFPA 58 §6.2.3] or [IFGC §404.1]
3. Keep answers under 200 words — techs are in the field
4. If a section number is uncertain, say so — never invent one
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
      const errMsg = data.error || ('Error ' + res.status);
      addMsg('⚠️ ' + errMsg, 'bot');
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
const TABLES = {
  steel: {
    name: 'Schedule 40 Steel',
    code: 'NFPA 54 Table 6.2(b) / IFGC Table 402.4(2)',
    sizes: [
      { nom:'1/2"',   id:0.622, lp:75000,   ng:32000  },
      { nom:'3/4"',   id:0.824, lp:175000,  ng:72000  },
      { nom:'1"',     id:1.049, lp:345000,  ng:143000 },
      { nom:'1-1/4"', id:1.380, lp:750000,  ng:310000 },
      { nom:'1-1/2"', id:1.610, lp:1175000, ng:490000 },
      { nom:'2"',     id:2.067, lp:2300000, ng:950000 }
    ]
  },
  csst: {
    name: 'CSST',
    code: 'NFPA 54 / Manufacturer sizing tables (verify with mfr)',
    sizes: [
      { nom:'3/8"',   id:0.375, lp:40000,  ng:17000  },
      { nom:'1/2"',   id:0.500, lp:85000,  ng:35000  },
      { nom:'3/4"',   id:0.750, lp:215000, ng:90000  },
      { nom:'1"',     id:1.000, lp:450000, ng:190000 },
      { nom:'1-1/4"', id:1.250, lp:800000, ng:340000 }
    ]
  },
  copper: {
    name: 'Copper Type L',
    code: 'NFPA 54 Table 6.3 — ⚠️ NOT for LP in many jurisdictions',
    sizes: [
      { nom:'3/8"',   id:0.430, lp:40000,  ng:17000  },
      { nom:'1/2"',   id:0.545, lp:85000,  ng:35000  },
      { nom:'3/4"',   id:0.785, lp:215000, ng:90000  },
      { nom:'1"',     id:1.025, lp:430000, ng:180000 },
      { nom:'1-1/4"', id:1.265, lp:780000, ng:325000 }
    ]
  },
  pe: {
    name: 'PE/HDPE Underground',
    code: 'NFPA 58 §5.11 / ASTM D2513 — Underground use only',
    sizes: [
      { nom:'1/2"',   id:0.622, lp:70000,   ng:29000  },
      { nom:'3/4"',   id:0.824, lp:165000,  ng:68000  },
      { nom:'1"',     id:1.049, lp:325000,  ng:135000 },
      { nom:'1-1/4"', id:1.380, lp:700000,  ng:290000 },
      { nom:'1-1/2"', id:1.610, lp:1100000, ng:460000 },
      { nom:'2"',     id:2.067, lp:2150000, ng:890000 }
    ]
  }
};

function lenFactor(ft) {
  if (ft <= 10)  return 1.40;
  if (ft <= 20)  return 1.20;
  if (ft <= 30)  return 1.10;
  if (ft <= 50)  return 1.00;
  if (ft <= 75)  return 0.88;
  if (ft <= 100) return 0.80;
  if (ft <= 150) return 0.70;
  if (ft <= 200) return 0.63;
  if (ft <= 300) return 0.54;
  return 0.46;
}

function calcPipe() {
  const gasType = document.getElementById('gas-type').value;
  const mat     = document.getElementById('pipe-mat').value;
  const btu     = parseFloat(document.getElementById('btu').value);
  const ft      = parseFloat(document.getElementById('runft').value);

  const errEl = document.getElementById('pipe-err');
  const resEl = document.getElementById('pipe-res');
  errEl.classList.add('hidden');
  resEl.classList.add('hidden');

  if (!btu || btu <= 0) { errEl.textContent = 'Please enter a BTU/hr load.'; errEl.classList.remove('hidden'); return; }
  if (!ft  || ft  <= 0) { errEl.textContent = 'Please enter a run length.';  errEl.classList.remove('hidden'); return; }

  const tbl = TABLES[mat];
  const lf  = lenFactor(ft);
  const needed = btu / lf;

  const minRow = tbl.sizes.find(s => s[gasType] >= needed);
  const recRow = tbl.sizes.find(s => s[gasType] >= needed * 1.25);

  if (!minRow) {
    errEl.textContent = `Load of ${btu.toLocaleString()} BTU/hr over ${ft} ft exceeds ${tbl.name} table capacity. Consider a larger distribution system or consult an engineer.`;
    errEl.classList.remove('hidden');
    return;
  }

  const btuPerCf = gasType === 'lp' ? 2516 : 1020;
  const area = Math.PI * Math.pow(minRow.id / 2, 2) / 144; // sq ft
  const vel  = Math.round((btu / btuPerCf / 3600) / area);

  let noteText = `${ft} ft run · length factor ${lf.toFixed(2)} · adjusted load ${Math.round(needed).toLocaleString()} BTU/hr. `;
  noteText += gasType === 'lp'
    ? 'Verify with locally adopted NFPA 58 and your AHJ.'
    : 'Verify with locally adopted NFPA 54 / IFGC and your AHJ.';
  if (mat === 'copper') noteText += ' ⚠️ Copper is NOT permitted for LP in many jurisdictions — confirm locally.';
  if (mat === 'pe')     noteText += ' PE/HDPE is underground use only per NFPA 58 §5.11.';

  resEl.innerHTML = `
    <div class="result-box">
      <div class="result-hero">
        <span class="result-num">${(recRow || minRow).nom}</span>
        <span class="result-label">${tbl.name}</span>
      </div>
      <div class="result-row"><span class="rk">Recommended (w/ safety margin)</span><span class="rv">${(recRow || minRow).nom}</span></div>
      <div class="result-row"><span class="rk">Minimum acceptable size</span><span class="rv">${minRow.nom}</span></div>
      <div class="result-row"><span class="rk">Max capacity at this run</span><span class="rv">${Math.round(minRow[gasType] * lf).toLocaleString()} BTU/hr</span></div>
      <div class="result-row"><span class="rk">Approx. gas velocity</span><span class="rv">${vel} ft/s${vel > 50 ? ' ⚠️ High' : ''}</span></div>
      <div class="result-row"><span class="rk">Code reference</span><span class="rv">${tbl.code}</span></div>
      <div class="result-note">${noteText}</div>
    </div>`;
  resEl.classList.remove('hidden');
  resEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ── Notes ─────────────────────────────────────────────────────
function saveNotes() {
  localStorage.setItem('pcai_notes', JSON.stringify(notes));
}

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso), now = new Date(), diff = now - d;
  if (diff < 60000)     return 'Just now';
  if (diff < 3600000)   return Math.floor(diff / 60000) + 'm ago';
  if (diff < 86400000)  return Math.floor(diff / 3600000) + 'h ago';
  return d.toLocaleDateString('en-US', { month:'short', day:'numeric' });
}

function escN(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function renderNotes() {
  const q = (document.getElementById('note-search').value || '').toLowerCase();
  const list = document.getElementById('notes-list');
  const filtered = notes.filter(n =>
    (!q || n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q) || (n.tag||'').toLowerCase().includes(q))
  );

  if (!filtered.length) {
    list.innerHTML = `<div class="empty"><div class="empty-icon">📋</div>${
      q ? 'No notes match your search.' : 'No notes yet.<br>Tap <strong>+ New</strong> to start.'
    }</div>`;
    return;
  }

  list.innerHTML = filtered.map(n => `
    <div class="note-card" onclick="openNote('${n.id}')">
      <div class="note-top">
        <div class="note-title">${escN(n.title || 'Untitled')}</div>
        <div class="note-date">${fmtDate(n.updated)}</div>
      </div>
      <div class="note-preview">${escN(n.body || '')}</div>
      ${n.tag ? `<span class="note-tag">${escN(n.tag)}</span>` : ''}
    </div>`).join('');
}

function openEditor(note) {
  document.getElementById('ed-title').value = note ? note.title : '';
  document.getElementById('ed-body').value  = note ? note.body  : '';
  document.getElementById('ed-tag').value   = note ? (note.tag || '') : '';
  document.getElementById('del-btn').style.display = note ? 'inline-block' : 'none';
  editId = note ? note.id : null;
  document.getElementById('notes-inner').classList.add('editing');
  document.getElementById('editor').classList.add('open');
  setTimeout(() => document.getElementById(note ? 'ed-body' : 'ed-title').focus(), 80);
}

function newNote()        { openEditor(null); }
function openNote(id)     { openEditor(notes.find(n => n.id === id)); }

function closeEditor() {
  document.getElementById('notes-inner').classList.remove('editing');
  document.getElementById('editor').classList.remove('open');
  editId = null;
  renderNotes();
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
    notes.unshift({ id: 'n' + Date.now(), title, body, tag, created: new Date().toISOString(), updated: new Date().toISOString() });
  }
  saveNotes();
  closeEditor();
}

function delNote() {
  if (!editId) return;
  if (!confirm('Delete this note?')) return;
  notes = notes.filter(n => n.id !== editId);
  saveNotes();
  closeEditor();
}

// ── Service Worker ────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
