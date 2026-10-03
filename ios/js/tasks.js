// ── 展开 / 折叠 ───────────────────────────────────────────────────────────

function toggleExpand(id) {
  if (expanded.has(id)) expanded.delete(id); else expanded.add(id);
  saveExpanded();
  render();
}

// ── 划掉 / 取消划掉 ───────────────────────────────────────────────────────

// 母任务的勾只是结果，不是开关：子任务全完成它就自动勾上。
// 手动勾母任务则把子任务一起带上 —— 和提醒事项的行为一致。
async function setDone(id, next, cascade) {
  const t = tasks.find(x => x.id === id);
  if (!t || t.done === next) return;

  tasks = tasks.map(x => x.id === id ? {...x, done: next, doneDate: next ? TODAY : null} : x);
  if (next) logDone(t); else unlogDone(t);

  const writes = [dbUpdate(id, {done: next, doneDate: next ? TODAY : null})];
  if (cascade) {
    subsOf(id).forEach(k => {
      if (k.done !== next) { k.done = next; writes.push(dbUpdateSub(k.id, {done: next})); }
    });
  }
  render();
  await Promise.all(writes);
}

async function toggleDone(id) {
  const t = tasks.find(x => x.id === id);
  if (!t) return;
  if (isFolder(t)) return;        // 文件夹的勾是指示灯，不是开关
  await setDone(id, !t.done, true);
}

// 子任务打勾后，回头看母任务该不该跟着变
async function toggleSub(taskId, subId) {
  const k = subsOf(taskId).find(x => x.id === subId);
  if (!k) return;
  k.done = !k.done;
  k.doneAt = k.done ? new Date().toISOString() : null;
  render();
  await dbUpdateSub(subId, {done: k.done, done_at: k.doneAt});

  const parent = tasks.find(x => x.id === taskId);
  if (!parent) return;

  // 文件夹模式：母任务永远不进已完成，它只是个壳。
  // 勾不勾由 folderLit() 看子任务算，这里什么都不用做。
  if (isFolder(parent)) return;

  // 大任务模式：全勾上 → 母任务完成；取消任意一个 → 退回未完成
  const kids = subsOf(taskId);
  const all = kids.length > 0 && kids.every(x => x.done);
  if (all && !parent.done)  await setDone(taskId, true,  false);
  if (!all && parent.done)  await setDone(taskId, false, false);
}

// 从归档里把一条已完成的子任务放回去
async function restoreSub(taskId, subId) {
  const k = subsOf(taskId).find(x => x.id === subId);
  if (!k) return;
  k.done = false; k.doneAt = null;
  render();
  await dbUpdateSub(subId, {done: false, done_at: null});
}

async function restoreTask(id) {
  const t = tasks.find(x => x.id === id);
  if (t) unlogDone(t);
  tasks = tasks.map(x => x.id === id ? {...x, done: false, doneDate: null} : x);
  render();
  await dbUpdate(id, {done: false, doneDate: null});
}

// ── 删除（5 秒内可撤销）─────────────────────────────────────────────────────

let pendingDelete = null;   // {task, timer}

function deleteTask(id) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;
  if (pendingDelete) commitDelete();          // 上一条还没落盘就先落盘

  const keptSubs = subsOf(id);          // 撤销时要放回去
  tasks = tasks.filter(t => t.id !== id);
  delete subtasks[id];
  expanded.delete(id);
  render();

  const bar = document.getElementById('undo');
  document.getElementById('undo-text').textContent = `已删除「${task.text}」`;
  bar.classList.add('show');

  pendingDelete = {
    task, keptSubs,
    timer: setTimeout(commitDelete, 5000)
  };
}

async function commitDelete() {
  if (!pendingDelete) return;
  const {task, timer} = pendingDelete;
  clearTimeout(timer);
  pendingDelete = null;
  document.getElementById('undo').classList.remove('show');
  await dbDelete(task.id);
}

function undoDelete() {
  if (!pendingDelete) return;
  clearTimeout(pendingDelete.timer);
  tasks.push(pendingDelete.task);
  if (pendingDelete.keptSubs?.length) subtasks[pendingDelete.task.id] = pendingDelete.keptSubs;
  tasks.sort((a, b) => a.id - b.id);
  pendingDelete = null;
  document.getElementById('undo').classList.remove('show');
  render();
}

// ── 写一条 ────────────────────────────────────────────────────────────────

function openAddSheet(catId) {
  const cat = catOf(catId);
  if (!cat) return;
  window._addingTo = catId;

  const note = document.getElementById('add-note');
  if (note) note.textContent = TIMED.includes(catId)
    ? `${SHORT_TERM_DAYS} 天内到期归「短期」，更晚归「长期」，之后会自己挪`
    : `添加到「${cat.label}」`;

  const text = document.getElementById('add-text');
  const dateRow = document.getElementById('add-date-group');
  text.value = '';
  clearPicker('add');
  dateRow.style.display = cat.hasDate ? '' : 'none';

  renderPrio('add', 0);

  // iOS 的惯例：必填项空着时，右上角的确认是灰的、点不动
  const done = document.getElementById('add-done');
  const sync = () => { done.disabled = !text.value.trim(); };
  text.oninput = sync;
  sync();

  document.getElementById('add-sheet').classList.add('show');
  setTimeout(() => text.focus(), 320);
}

function closeAddSheet(e) {
  if (e && e.target !== document.getElementById('add-sheet')) return;
  document.getElementById('add-sheet').classList.remove('show');
  window._addingTo = null;
}

async function addTask(catId) {
  if (!catId) return;
  const text = document.getElementById('add-text').value.trim();
  if (!text) return;
  const cat = catOf(catId);
  const picked = cat?.hasDate ? readPicker('add') : {dueAt: null, allDay: true, date: null};
  const probe = {catId, dueAt: picked.dueAt, date: picked.date};
  const newTask = {
    id: Date.now(),
    catId: TIMED.includes(catId) ? bucketOf(probe) : catId,
    text,
    date: picked.date,
    dueAt: picked.dueAt,
    allDay: picked.allDay,
    importance: window._prio.add || 0,
    done: false,
    doneDate: null,
    subMode: 'task'
  };

  tasks.push(newTask);
  document.getElementById('add-sheet').classList.remove('show');
  window._addingTo = null;
  render();

  const dbId = await dbInsert(newTask);
  if (dbId == null) {
    tasks = tasks.filter(t => t !== newTask);
    render();
  }
}
