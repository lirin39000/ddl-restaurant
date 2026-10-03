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
  if (cat?.hasDate) { grp.style.display = ''; fillPicker('edit', task); }
  else { grp.style.display = 'none'; clearPicker('edit'); }

  renderPrio('edit', task.importance || 0);
  renderSubEditor(id);
  renderModePicker(id);
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
  const old = tasks.find(t => t.id === id);
  const cat = catOf(old?.catId);
  const picked = cat?.hasDate ? readPicker('edit') : {dueAt: null, allDay: true, date: null};
  const importance = window._prio.edit || 0;

  // 改了日期就可能跨过 7 天线，归属得重算
  const probe = {catId: old.catId, dueAt: picked.dueAt, date: picked.date};
  const catId = TIMED.includes(old.catId) ? bucketOf(probe) : old.catId;

  tasks = tasks.map(t => t.id === id
    ? {...t, text, importance, catId, dueAt: picked.dueAt, allDay: picked.allDay, date: picked.date}
    : t);
  document.getElementById('edit-sheet').classList.remove('show');
  editingId = null;
  render();
  await dbUpdate(id, {text, importance, catId,
    dueAt: picked.dueAt, allDay: picked.allDay, date: picked.date});
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

// ── 详细信息里的子任务编辑 ────────────────────────────────────────────────

function renderSubEditor(taskId) {
  const box = document.getElementById('edit-subs');
  if (!box) return;
  const kids = subsOf(taskId);
  box.innerHTML = kids.map(k => `
    <div class="row">
      <button class="sub-del" onclick="removeSub(${taskId},${k.id})" aria-label="删除子任务：${esc(k.text)}">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9.2" class="fill"/><path d="M8 12h8" class="knock"/></svg>
      </button>
      <span class="row-label row-label--grow">${esc(k.text)}</span>
    </div>`).join('') + `
    <div class="row">
      <button class="sub-add" onclick="addSub(${taskId})" aria-label="添加子任务">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9.2" class="fill"/><path d="M12 8v8M8 12h8" class="knock"/></svg>
      </button>
      <input class="row-input" id="sub-new" placeholder="添加子任务"
        onkeydown="if(event.key==='Enter'){event.preventDefault();addSub(${taskId});}"/>
    </div>`;
}

async function addSub(taskId) {
  const input = document.getElementById('sub-new');
  const text = input?.value.trim();
  if (!text) return;
  const pos = subsOf(taskId).length;
  const row = await dbAddSub(taskId, text, pos);
  if (!row) return;
  (subtasks[taskId] = subtasks[taskId] || []).push(row);
  expanded.add(taskId); saveExpanded();
  renderSubEditor(taskId);
  setTimeout(() => document.getElementById('sub-new')?.focus(), 0);
  render();
}

async function removeSub(taskId, subId) {
  subtasks[taskId] = subsOf(taskId).filter(k => k.id !== subId);
  renderSubEditor(taskId);
  render();
  await dbDeleteSub(subId);
}

// ── 日期 / 时间选择器 ─────────────────────────────────────────────────────
// 用原生 input[type=date] 和 input[type=time]：iOS 上直接弹系统滚轮，
// 不用自己画一个仿的。日期必填，时间通过开关决定要不要。

function toggleTime(prefix) {
  const on = document.getElementById(`${prefix}-has-time`).checked;
  document.getElementById(`${prefix}-time-row`).style.display = on ? '' : 'none';
  const t = document.getElementById(`${prefix}-time`);
  if (on && !t.value) t.value = '18:00';
}

function fillPicker(prefix, task) {
  const d = document.getElementById(`${prefix}-date`);
  const sw = document.getElementById(`${prefix}-has-time`);
  const t = document.getElementById(`${prefix}-time`);
  const due = task ? dueOf(task) : null;

  if (due) {
    d.value = ymd(due);
    const timed = task.allDay === false;
    sw.checked = timed;
    t.value = timed ? hhmm(due) : '18:00';
  } else {
    d.value = ''; sw.checked = false; t.value = '18:00';
  }
  toggleTime(prefix);
}

function clearPicker(prefix) {
  document.getElementById(`${prefix}-date`).value = '';
  document.getElementById(`${prefix}-has-time`).checked = false;
  document.getElementById(`${prefix}-time`).value = '18:00';
  toggleTime(prefix);
}

function readPicker(prefix) {
  const dv = document.getElementById(`${prefix}-date`).value;
  if (!dv) return {dueAt: null, allDay: true, date: null};
  const on = document.getElementById(`${prefix}-has-time`).checked;
  const tv = document.getElementById(`${prefix}-time`).value || '18:00';
  const [y, m, day] = dv.split('-').map(Number);
  const [hh, mm] = on ? tv.split(':').map(Number) : [23, 59];
  const dt = new Date(y, m - 1, day, hh, mm, 0, 0);
  return {dueAt: dt.toISOString(), allDay: !on, date: legacyDate(dt, !on)};
}

// ── 子任务模式 ────────────────────────────────────────────────────────────

function renderModePicker(taskId) {
  const grp = document.getElementById('edit-mode-group');
  const box = document.getElementById('edit-mode');
  const note = document.getElementById('edit-mode-note');
  const task = tasks.find(t => t.id === taskId);
  const has = subsOf(taskId).length > 0;

  grp.style.display = has ? '' : 'none';
  if (!has) { note.textContent = '加了子任务之后，可以选这条是大任务还是文件夹。'; return; }

  const cur = modeOf(task);
  box.innerHTML = SUB_MODES.map(m =>
    `<button type="button" class="seg-item${m.id===cur?' on':''}" onclick="pickMode(${taskId},'${m.id}')">${m.label}</button>`
  ).join('');
  note.textContent = cur === 'folder'
    ? '文件夹：母任务只是个壳，不会进已完成。进已完成的是完成了的子任务。'
    : '大任务：子任务全部完成后，整条自动打勾并进入已完成。';
}

async function pickMode(taskId, mode) {
  const t = tasks.find(x => x.id === taskId);
  if (!t || modeOf(t) === mode) return;
  t.subMode = mode;
  // 切成文件夹时，母任务自己不该是「已完成」状态
  if (mode === 'folder' && t.done) {
    t.done = false; t.doneDate = null;
    await dbUpdate(taskId, {done: false, doneDate: null});
  }
  renderModePicker(taskId);
  render();
  await dbUpdate(taskId, {subMode: mode});
}
