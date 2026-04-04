// ── Importance slider helpers ─────────────────────────────────────────────

function importanceBgColor(imp, cat) {
  if (!cat) return '#eee';
  const t = Math.max(0, Math.min(100, imp || 0)) / 100;
  const a = cat.bgColor, b = cat.darkBgColor || '#555';
  const ar=parseInt(a.slice(1,3),16), ag=parseInt(a.slice(3,5),16), ab=parseInt(a.slice(5,7),16);
  const br=parseInt(b.slice(1,3),16), bg=parseInt(b.slice(3,5),16), bb=parseInt(b.slice(5,7),16);
  return `rgb(${Math.round(ar+(br-ar)*t)},${Math.round(ag+(bg-ag)*t)},${Math.round(ab+(bb-ab)*t)})`;
}

function updateImportanceSlider(prefix, catId, val) {
  const slider = document.getElementById(`${prefix}-importance`);
  const valEl = document.getElementById(`${prefix}-importance-val`);
  if (!slider) return;
  const cat = CATS.find(c => c.id === catId);
  const pct = parseInt(val) || 0;
  const light = cat?.bgColor || '#f0f0f0';
  const dark = cat?.darkBgColor || '#555';
  slider.style.background = pct <= 0
    ? light
    : `linear-gradient(to right, ${dark} ${pct}%, ${light} ${pct}%)`;
  if (valEl) {
    if (pct === 0) { valEl.textContent = '一般'; valEl.style.color = '#aaa'; }
    else if (pct < 30) { valEl.textContent = '稍微重要'; valEl.style.color = '#888'; }
    else if (pct < 60) { valEl.textContent = '比较重要'; valEl.style.color = '#666'; }
    else if (pct < 85) { valEl.textContent = '很重要'; valEl.style.color = '#444'; }
    else { valEl.textContent = '非常重要！'; valEl.style.color = '#c00'; }
  }
}

function onImportanceInput(prefix) {
  const slider = document.getElementById(`${prefix}-importance`);
  if (!slider) return;
  const catId = prefix === 'add' ? window._addingTo : tasks.find(t => t.id === editingId)?.catId;
  updateImportanceSlider(prefix, catId, slider.value);
}

// ── Loading ───────────────────────────────────────────────────────────────

function showLoading(v) {
  clearTimeout(loadingTimer);
  const el = document.getElementById('loading-overlay');
  if (v) {
    const dotsEl = document.getElementById('loading-dots');
    if (dotsEl && dotsEl.children.length === 0) {
      const cols = 5, rows = 5;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const s = document.createElement('span');
          s.textContent = FOOD_EMOJIS[(r * cols + c) % FOOD_EMOJIS.length];
          s.style.left = (c * (100 / (cols - 1))) + '%';
          s.style.top = (r * (100 / (rows - 1)) + 20) + '%';
          s.style.animationDelay = (r * 0.4 + c * 0.2) + 's';
          s.style.animationDuration = '5s';
          dotsEl.appendChild(s);
        }
      }
    }
    const tipEl = document.getElementById('loading-tip');
    if (tipEl) tipEl.textContent = LOADING_TIPS[Math.floor(Math.random() * LOADING_TIPS.length)];
    el.classList.remove('hidden');
    loadingTimer = setTimeout(() => showLoading(false), 8000);
  } else {
    el.classList.add('hidden');
  }
}

// ── Theme ─────────────────────────────────────────────────────────────────

function applyTheme(id) {
  currentTheme = id;
  document.body.dataset.theme = id;
  const t = THEMES.find(x => x.id === id) || THEMES[0];
  document.getElementById("header-logo").textContent = t.logo;
  document.getElementById("header-tagline").textContent = t.tagline;
  document.getElementById("header-badge").textContent = t.badge;
  document.querySelector('meta[name="theme-color"]').setAttribute('content', t.dotBg);
  localStorage.setItem("ddl-theme", id);
  renderThemeGrid();
}

function renderThemeGrid() {
  const grid = document.getElementById("theme-grid");
  grid.innerHTML = THEMES.map(t => `
    <div class="theme-option${t.id===currentTheme?' selected':''}" style="${t.id===currentTheme?`border-color:${t.dotBg}`:'border-color:#eee'}" onclick="pickTheme('${t.id}')">
      <div class="theme-dot" style="background:${t.dotBg};color:${t.dotText}">${t.emoji}</div>
      <div class="theme-info"><div class="theme-brand" style="${t.id===currentTheme?`color:${t.dotBg}`:'color:#1a1a1a'}">${t.name}</div><div class="theme-tag">${t.tag}</div></div>
    </div>`).join('');
}

function openThemeSheet() { renderThemeGrid(); document.getElementById("theme-sheet").classList.add("show"); }
function closeThemeSheet(e) { if (e.target === document.getElementById("theme-sheet")) document.getElementById("theme-sheet").classList.remove("show"); }
function pickTheme(id) { applyTheme(id); setTimeout(() => document.getElementById("theme-sheet").classList.remove("show"), 180); }

// ── Swipe ────────────────────────────────────────────────────────────────

function attachSwipeListeners() {
  document.querySelectorAll('.task-card[data-id]').forEach(card => {
    const id = parseInt(card.dataset.id);
    let startX = null, startY = null, curX = 0, isSwipe = false;
    function showAct(v) { const bg = document.getElementById(`actbg-${id}`); if (bg) bg.classList.toggle('visible', v); }
    function snapBack() { card.style.transition = 'transform 0.22s ease'; card.style.transform = 'translateX(0)'; card.classList.remove('swiped'); showAct(false); }
    function snapOpen() { card.style.transition = 'transform 0.22s ease'; card.style.transform = `translateX(-${SWIPE_REVEAL}px)`; card.classList.add('swiped'); showAct(true); }
    function onStart(cx, cy) { if (card.classList.contains('swiped')) { snapBack(); return; } startX = cx; startY = cy; curX = 0; isSwipe = false; }
    function onMove(cx, cy, e) {
      if (startX === null) return;
      const dx = cx - startX, dy = cy - startY;
      if (!isSwipe) { if (Math.abs(dx) < 8) return; if (Math.abs(dy) > Math.abs(dx)) { startX = null; return; } isSwipe = true; }
      if (e) e.preventDefault();
      const clamp = Math.max(Math.min(dx, 0), -SWIPE_REVEAL - 8); curX = clamp;
      card.style.transition = 'none'; card.style.transform = `translateX(${clamp}px)`; showAct(clamp < -8);
    }
    function onEnd() { if (!isSwipe) { startX = null; return; } startX = null; isSwipe = false; if (curX <= -SWIPE_COMMIT) snapOpen(); else snapBack(); curX = 0; }
    card.addEventListener('touchstart', e => { onStart(e.touches[0].clientX, e.touches[0].clientY); }, {passive: true});
    card.addEventListener('touchmove', e => { onMove(e.touches[0].clientX, e.touches[0].clientY, e); }, {passive: false});
    card.addEventListener('touchend', onEnd);
    card.addEventListener('touchcancel', onEnd);
    card.addEventListener('mousedown', e => {
      onStart(e.clientX, e.clientY);
      const mv = e2 => onMove(e2.clientX, e2.clientY, null);
      const up = () => { onEnd(); document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); };
      document.addEventListener('mousemove', mv);
      document.addEventListener('mouseup', up);
    });
  });
}

// ── Edit modal ────────────────────────────────────────────────────────────

function openEditModal(id) {
  const card = document.getElementById(`card-${id}`);
  const bg = document.getElementById(`actbg-${id}`);
  if (card) { card.style.transition = 'transform 0.22s ease'; card.style.transform = 'translateX(0)'; card.classList.remove('swiped'); }
  if (bg) bg.classList.remove('visible');
  const task = tasks.find(t => t.id === id); if (!task) return;
  const cat = CATS.find(c => c.id === task.catId);
  editingId = id;
  const ti = document.getElementById('edit-text-input');
  const di = document.getElementById('edit-date-input');
  ti.value = task.text;
  if (cat?.hasDate) { di.style.display = 'block'; di.value = task.date || ''; }
  else { di.style.display = 'none'; di.value = ''; }
  const impSlider = document.getElementById('edit-importance');
  if (impSlider) { impSlider.value = task.importance || 0; updateImportanceSlider('edit', task.catId, task.importance || 0); }
  document.getElementById('edit-modal').classList.add('show');
  setTimeout(() => ti.focus(), 320);
}

function closeEditModal(e) {
  if (e && e.target !== document.getElementById('edit-modal')) return;
  document.getElementById('edit-modal').classList.remove('show');
  editingId = null;
}

async function saveEdit() {
  if (!editingId) return;
  const sid = editingId;
  const text = document.getElementById('edit-text-input').value.trim(); if (!text) return;
  const dateVal = document.getElementById('edit-date-input').value.trim();
  const cat = CATS.find(c => c.id === tasks.find(t => t.id === sid)?.catId);
  const newDate = cat?.hasDate && dateVal ? dateVal : null;
  const importance = parseInt(document.getElementById('edit-importance')?.value || '0');
  tasks = tasks.map(t => t.id === sid ? {...t, text, date: newDate, importance} : t);
  document.getElementById('edit-modal').classList.remove('show');
  editingId = null;
  render();
  await dbUpdate(sid, {text, date: newDate, importance});
}

// ── Nav ───────────────────────────────────────────────────────────────────

function updateNavHighlight(id) {
  document.querySelectorAll(".nav-item[data-cat]").forEach(el => el.classList.toggle("active", el.dataset.cat === id));
  document.getElementById("completed-nav").classList.toggle("active", completedOpen && !id);
}

function scrollToSection(catId) {
  const sec = document.getElementById(`sec-${catId}`);
  const main = document.getElementById("main");
  if (!sec || !main) return;
  scrollingProg = true;
  updateNavHighlight(catId);
  main.scrollTo({top: sec.offsetTop - 4, behavior: "smooth"});
  setTimeout(() => { scrollingProg = false; }, 600);
}

function toggleCompleted() {
  completedOpen = !completedOpen;
  const sec = document.getElementById("completed-section");
  if (sec) sec.style.display = completedOpen ? 'block' : 'none';
  document.getElementById("completed-nav").classList.toggle("active", completedOpen);
  if (completedOpen) setTimeout(() => {
    const s = document.getElementById("completed-section");
    if (s) document.getElementById("main").scrollTo({top: s.offsetTop - 4, behavior: "smooth"});
  }, 50);
  updateNavHighlight(null);
}

// ── Modal ─────────────────────────────────────────────────────────────────

function closeModal(id) { document.getElementById(id).classList.remove("show"); }
