// ── Task completion ───────────────────────────────────────────────────────

function handleComplete(e, id) {
  e.stopPropagation(); e.preventDefault();
  const card = document.getElementById(`card-${id}`);
  if (!card) return;
  card.classList.add('completing');
  setTimeout(async () => {
    tasks = tasks.map(t => t.id === id ? {...t, done: true, doneDate: TODAY} : t);
    render();
    await dbUpdate(id, {done: true, doneDate: TODAY});
  }, 220);
}

// ── Task CRUD ─────────────────────────────────────────────────────────────

async function deleteTask(id) {
  tasks = tasks.filter(t => t.id !== id);
  render();
  await dbDelete(id);
}

async function restoreTask(id) {
  tasks = tasks.map(t => t.id === id ? {...t, done: false, doneDate: null} : t);
  render();
  await dbUpdate(id, {done: false, doneDate: null});
}

function toggleAdd(catId) {
  const cat = CATS.find(c => c.id === catId);
  window._addingTo = catId;
  const dot = document.getElementById('add-sheet-dot');
  const nm = document.getElementById('add-sheet-cat-name');
  const di = document.getElementById('add-sheet-date');
  const ti = document.getElementById('add-sheet-text');
  if (dot) dot.style.background = cat?.bgColor || '#ccc';
  if (nm) nm.textContent = `${cat?.emoji||''} ${cat?.label||''}`;
  if (di) di.style.display = cat?.hasDate ? 'block' : 'none';
  if (ti) { ti.value = ''; setTimeout(() => ti.focus(), 320); }
  if (di) di.value = '';
  const impSlider = document.getElementById('add-importance');
  if (impSlider) { impSlider.value = 0; updateImportanceSlider('add', catId, 0); }
  document.getElementById('add-sheet').classList.add('show');
}

function closeAddSheet(e) {
  if (e && e.target !== document.getElementById('add-sheet')) return;
  document.getElementById('add-sheet').classList.remove('show');
  window._addingTo = null;
}

function cancelAdd() {
  document.getElementById('add-sheet').classList.remove('show');
  window._addingTo = null;
}

async function addTask(catId) {
  if (!catId) return;
  const text = document.getElementById('add-sheet-text')?.value.trim();
  if (!text) return;
  const dateVal = document.getElementById('add-sheet-date')?.value.trim();
  const importance = parseInt(document.getElementById('add-importance')?.value || '0');
  const cat = CATS.find(c => c.id === catId);
  const newTask = {id: Date.now(), catId, text, date: cat?.hasDate && dateVal ? dateVal : null, importance, done: false, doneDate: null};
  tasks.push(newTask);
  document.getElementById('add-sheet').classList.remove('show');
  window._addingTo = null;
  render();
  const dbId = await dbInsert(newTask);
  if (dbId != null) {
    newTask.id = dbId;
    render();
  } else {
    tasks = tasks.filter(t => t !== newTask);
    render();
  }
}
