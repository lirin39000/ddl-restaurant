// ── 划掉 / 取消划掉 ───────────────────────────────────────────────────────

async function toggleDone(id) {
  const t = tasks.find(x => x.id === id);
  if (!t) return;
  const next = !t.done;
  tasks = tasks.map(x => x.id === id ? {...x, done: next, doneDate: next ? TODAY : null} : x);
  if (next) logDone(t); else unlogDone(t);
  render();
  await dbUpdate(id, {done: next, doneDate: next ? TODAY : null});
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

  tasks = tasks.filter(t => t.id !== id);
  render();

  const bar = document.getElementById('undo');
  document.getElementById('undo-text').textContent = `已删除「${task.text}」`;
  bar.classList.add('show');

  pendingDelete = {
    task,
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
  const dateIn = document.getElementById('add-date');
  text.value = '';
  dateIn.value = '';
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
  const dateVal = document.getElementById('add-date').value.trim();
  const probe = {catId, date: cat?.hasDate && dateVal ? dateVal : null};
  const newTask = {
    id: Date.now(),
    catId: TIMED.includes(catId) ? bucketOf(probe) : catId,
    text,
    date: cat?.hasDate && dateVal ? dateVal : null,
    importance: window._prio.add || 0,
    done: false,
    doneDate: null
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
