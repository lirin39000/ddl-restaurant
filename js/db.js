// ── Database operations ───────────────────────────────────────────────────

async function loadTasks() {
  showLoading(true);
  try {
    const {data, error} = await sb.from('tasks').select('*').eq('user_id', currentUser.id).order('id', {ascending: true});
    if (data) {
      tasks = data.map(r => ({id: Number(r.id), catId: r.cat_id, text: r.text, date: r.date, importance: r.importance || 0, done: r.done, doneDate: r.done_date}));
      // Daily reset: only reset grey tasks whose done_date is NOT today
      const toReset = tasks.filter(t => {
        const c = CATS.find(x => x.id === t.catId);
        return c?.grey && t.done && t.doneDate !== TODAY;
      });
      if (toReset.length > 0) {
        await Promise.all(toReset.map(t => sb.from('tasks').update({done: false, done_date: null}).eq('id', t.id)));
        tasks = tasks.map(t => {
          const c = CATS.find(x => x.id === t.catId);
          if (c?.grey && t.done && t.doneDate !== TODAY) return {...t, done: false, doneDate: null};
          return t;
        });
      }
    }
  } catch(e) { console.error('loadTasks error', e); }
  showLoading(false);
  render();
}

async function dbInsert(task) {
  try {
    const {error} = await sb.from('tasks').insert({id: task.id, user_id: currentUser.id, cat_id: task.catId, text: task.text, date: task.date, importance: task.importance || 0, done: task.done, done_date: task.doneDate});
    if (error) throw error;
    return task.id;
  } catch(e) { console.error('dbInsert error', e); return null; }
}

async function dbUpdate(id, fields) {
  try {
    const mapped = {};
    if (fields.text !== undefined) mapped.text = fields.text;
    if (fields.date !== undefined) mapped.date = fields.date;
    if (fields.importance !== undefined) mapped.importance = fields.importance;
    if (fields.done !== undefined) mapped.done = fields.done;
    if (fields.doneDate !== undefined) mapped.done_date = fields.doneDate;
    await sb.from('tasks').update(mapped).eq('id', id);
  } catch(e) { console.error(e); }
}

async function dbDelete(id) {
  try { await sb.from('tasks').delete().eq('id', id); } catch(e) { console.error(e); }
}
