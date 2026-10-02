// ── 启动遮罩 ──────────────────────────────────────────────────────────────

function showLoading(v) {
  clearTimeout(loadingTimer);
  const el = document.getElementById('splash');
  if (v) {
    el.classList.remove('hidden');
    loadingTimer = setTimeout(() => showLoading(false), 8000);
  } else {
    el.classList.add('hidden');
  }
}

// ── 外观 ──────────────────────────────────────────────────────────────────

function applyAppearance(id) {
  currentAppearance = id;
  document.documentElement.dataset.appearance = id;
  localStorage.setItem('ddl-appearance', id);
  // 状态栏颜色跟着走，否则深色下顶部会留一条白边
  const dark = id === 'dark' ||
    (id === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelectorAll('meta[name="theme-color"]').forEach(m => m.remove());
  const m = document.createElement('meta');
  m.name = 'theme-color';
  m.content = dark ? '#000000' : '#F2F2F7';
  document.head.appendChild(m);
  renderAppearanceSeg();
}

function renderAppearanceSeg() {
  const seg = document.getElementById('appearance-seg');
  if (!seg) return;
  seg.innerHTML = APPEARANCES.map(a =>
    `<button class="seg-item${a.id===currentAppearance?' on':''}" onclick="applyAppearance('${a.id}')">${a.name}</button>`
  ).join('');
}

// ── 导航栏：滚过大标题就变毛玻璃 ──────────────────────────────────────────

function watchScroll() {
  const scroll = document.getElementById('scroll');
  const nav = document.getElementById('navbar');
  const onScroll = () => nav.classList.toggle('stuck', scroll.scrollTop > 26);
  scroll.addEventListener('scroll', onScroll, {passive: true});
  onScroll();
}

// ── 优先级分段控件 ────────────────────────────────────────────────────────

window._prio = {add: 0, edit: 0};

function renderPrio(prefix, value) {
  const box = document.getElementById(`${prefix}-prio`);
  if (!box) return;
  const cur = priorityOf(value).v;
  window._prio[prefix] = cur;
  box.innerHTML = PRIORITIES.map(p =>
    `<button type="button" class="seg-item${p.v===cur?' on':''}" onclick="pickPrio('${prefix}',${p.v})">${p.label}</button>`
  ).join('');
}

function pickPrio(prefix, v) {
  window._prio[prefix] = v;
  renderPrio(prefix, v);
}

// ── 滑动 ──────────────────────────────────────────────────────────────────
// 操作按钮铺在整行底下（inset:0 0 0 auto），行本身不透明盖住它们，
// 向左滑行就露出来 —— 和 iOS 列表一致。

function attachSwipe() {
  document.querySelectorAll('.item-in[data-id]').forEach(row => {
    let startX = null, startY = null, curX = 0, moving = false;

    const to = (px, anim) => {
      row.style.transition = anim ? '' : 'none';
      row.style.transform = px ? `translateX(${px}px)` : '';
    };
    const close = () => { to(0, true); row.classList.remove('swiped'); };
    const open  = () => { to(-SWIPE_REVEAL, true); row.classList.add('swiped'); };

    function onStart(cx, cy) {
      if (row.classList.contains('swiped')) { close(); return; }
      startX = cx; startY = cy; curX = 0; moving = false;
    }
    function onMove(cx, cy, e) {
      if (startX === null) return;
      const dx = cx - startX, dy = cy - startY;
      if (!moving) {
        if (Math.abs(dx) < 8) return;
        if (Math.abs(dy) > Math.abs(dx)) { startX = null; return; }
        moving = true;
      }
      if (e) e.preventDefault();
      curX = Math.max(Math.min(dx, 0), -SWIPE_REVEAL - 10);
      to(curX, false);
    }
    function onEnd() {
      if (!moving) { startX = null; return; }
      startX = null; moving = false;
      if (curX <= -SWIPE_COMMIT) open(); else close();
      curX = 0;
    }

    row.addEventListener('touchstart', e => onStart(e.touches[0].clientX, e.touches[0].clientY), {passive:true});
    row.addEventListener('touchmove',  e => onMove(e.touches[0].clientX, e.touches[0].clientY, e), {passive:false});
    row.addEventListener('touchend', onEnd);
    row.addEventListener('touchcancel', onEnd);
    row.addEventListener('mousedown', e => {
      if (e.target.closest('button')) return;
      onStart(e.clientX, e.clientY);
      const mv = e2 => onMove(e2.clientX, e2.clientY, null);
      const up = () => { onEnd(); document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); };
      document.addEventListener('mousemove', mv);
      document.addEventListener('mouseup', up);
    });
  });
}

function unswipe(id) {
  const row = document.querySelector(`#item-${id} .item-in`);
  if (!row) return;
  row.style.transition = '';
  row.style.transform = '';
  row.classList.remove('swiped');
}

// ── 详细信息 ──────────────────────────────────────────────────────────────

function openEditSheet(id) {
  unswipe(id);
  const task = tasks.find(t => t.id === id); if (!task) return;
  const cat = catOf(task.catId);
  editingId = id;

  document.getElementById('edit-text').value = task.text;
  const grp = document.getElementById('edit-date-group');
  const inp = document.getElementById('edit-date');
  if (cat?.hasDate) { grp.style.display = ''; inp.value = task.date || ''; }
  else { grp.style.display = 'none'; inp.value = ''; }

  renderPrio('edit', task.importance || 0);
  document.getElementById('edit-sheet').classList.add('show');
  setTimeout(() => document.getElementById('edit-text').focus(), 380);
}

function closeEditSheet(e) {
  if (e && e.target !== document.getElementById('edit-sheet')) return;
  document.getElementById('edit-sheet').classList.remove('show');
  editingId = null;
}

async function saveEdit() {
  if (!editingId) return;
  const id = editingId;
  const text = document.getElementById('edit-text').value.trim();
  if (!text) return;
  const cat = catOf(tasks.find(t => t.id === id)?.catId);
  const dateVal = document.getElementById('edit-date').value.trim();
  const date = cat?.hasDate && dateVal ? dateVal : null;
  const importance = window._prio.edit || 0;

  const old = tasks.find(t => t.id === id);
  // 改了日期就可能跨过 7 天线，归属得重算
  const catId = TIMED.includes(old.catId) ? bucketOf({catId: old.catId, date}) : old.catId;

  tasks = tasks.map(t => t.id === id ? {...t, text, date, importance, catId} : t);
  document.getElementById('edit-sheet').classList.remove('show');
  editingId = null;
  render();
  await dbUpdate(id, {text, date, importance, catId});
}

// ── 更多 ──────────────────────────────────────────────────────────────────

function openMoreSheet() {
  renderAppearanceSeg();
  renderLog();
  const note = document.getElementById('account-note');
  if (note) note.textContent = currentUser?.email ? `已登录：${currentUser.email}` : '';
  document.getElementById('more-sheet').classList.add('show');
}

function closeMoreSheet(e) {
  if (e && e.target !== document.getElementById('more-sheet')) return;
  document.getElementById('more-sheet').classList.remove('show');
}
