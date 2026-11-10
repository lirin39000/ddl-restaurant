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
  markLocal(id);
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
  markLocal(taskId);
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
  markLocal(taskId);
  render();
  await dbUpdateSub(subId, {done: false, done_at: null});
}

async function restoreTask(id) {
  const t = tasks.find(x => x.id === id);
  if (t) unlogDone(t);
  tasks = tasks.map(x => x.id === id ? {...x, done: false, doneDate: null} : x);
  markLocal(id);
  render();
  await dbUpdate(id, {done: false, doneDate: null});
}

// ── 删除（5 秒内可撤销）─────────────────────────────────────────────────────
// 单条删除和「清空已完成」共用一套。要删的东西有两种：
//   rows      整条任务（连它的子任务一起，数据库那边是级联删）
//   looseSubs 文件夹里那几条已完成的子任务 —— 壳子要留着，只删子任务
// 撤销时原样放回去，所以删之前得把它们都接住。

let pendingDelete = null;

function beginDelete(label, rows, looseSubs) {
  if (pendingDelete) commitDelete();          // 上一批还没落盘就先落盘

  const keptSubs = {};
  const ids = new Set(rows.map(t => t.id));
  rows.forEach(t => {
    const kids = subsOf(t.id);
    if (kids.length) keptSubs[t.id] = kids;
    delete subtasks[t.id];
    expanded.delete(t.id);
    markLocal(t.id);
  });
  tasks = tasks.filter(t => !ids.has(t.id));

  looseSubs.forEach(({sub, parentId}) => {
    subtasks[parentId] = subsOf(parentId).filter(k => k.id !== sub.id);
    markLocal(parentId);
  });

  render();
  showUndoBar(label);
  pendingDelete = {rows, keptSubs, looseSubs, timer: setTimeout(commitDelete, 5000)};
}

function deleteTask(id) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;
  beginDelete(`已删除「${task.text}」`, [task], []);
}

// 「已完成」里堆着的一次清掉。列表里是两种东西，都得算进去。
function clearArchive() {
  const rows = archived();
  const subs = archivedSubs();
  const n = rows.length + subs.length;
  if (!n) return;

  const extra = subs.length ? `
其中 ${subs.length} 项是文件夹里已完成的子任务。` : '';
  if (!confirm(`清空已完成？
${n} 项会被永久删除，不能恢复。${extra}`)) return;

  beginDelete(`已清空 ${n} 项`, rows, subs.map(({sub, parent}) => ({sub, parentId: parent.id})));
}

async function commitDelete() {
  if (!pendingDelete) return;
  const {rows, looseSubs, timer} = pendingDelete;
  clearTimeout(timer);
  pendingDelete = null;
  document.getElementById('undo').classList.remove('show');
  await Promise.all([
    ...rows.map(t => dbDelete(t.id)),
    ...looseSubs.map(({sub}) => dbDeleteSub(sub.id)),
  ]);
}

function undoDelete() {
  if (!pendingDelete) return;
  const {rows, keptSubs, looseSubs, timer} = pendingDelete;
  clearTimeout(timer);
  pendingDelete = null;

  rows.forEach(t => {
    tasks.push(t);
    markLocal(t.id);
    if (keptSubs[t.id]) subtasks[t.id] = keptSubs[t.id];
  });
  tasks.sort((a, b) => a.id - b.id);

  looseSubs.forEach(({sub, parentId}) => {
    const kids = (subtasks[parentId] = subsOf(parentId));
    kids.push(sub);
    kids.sort((a, b) => (a.position || 0) - (b.position || 0));
    markLocal(parentId);
  });

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
  markLocal(newTask.id);
  document.getElementById('add-sheet').classList.remove('show');
  window._addingTo = null;
  render();

  // 存不上也别把它从列表里抹掉 —— 那就是「刚添上又不见了」。
  // 留在原地标个「未同步」，等网络好了 flushUnsynced 自己补。
  if ((await dbInsert(newTask)) == null) {
    newTask.unsynced = true;
    markLocal(newTask.id);
    render();
    saveCache();
    toast('没存上，网络恢复后会自动补上');
    flushTimer = setTimeout(flushUnsynced, 8000);
  }
}
