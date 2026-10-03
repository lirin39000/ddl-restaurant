// ── Database operations ───────────────────────────────────────────────────

async function loadTasks() {
  showLoading(true);
  try {
    const {data, error} = await sb.from('tasks').select('*').eq('user_id', currentUser.id).order('id', {ascending: true});
    if (data) {
      tasks = data.map(r => ({id: Number(r.id), catId: r.cat_id, text: r.text, date: r.date, importance: r.importance || 0, done: r.done, doneDate: r.done_date}));
      // Daily reset: only reset grey tasks whose done_date is NOT today
      const toReset = tasks.filter(t => {
        const c = CATS.find(x => x.id === bucketOf(t));
        return c?.grey && t.done && t.doneDate !== TODAY;
      });
      if (toReset.length > 0) {
        await Promise.all(toReset.map(t => sb.from('tasks').update({done: false, done_date: null}).eq('id', t.id)));
        tasks = tasks.map(t => {
          const c = CATS.find(x => x.id === bucketOf(t));
          if (c?.grey && t.done && t.doneDate !== TODAY) return {...t, done: false, doneDate: null};
          return t;
        });
      }
    }
  } catch(e) { console.error('loadTasks error', e); }
  await loadSubtasks();
  showLoading(false);
  render();
  reconcileBuckets();   // 不 await：写回是后台的事，不该拖住首屏
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
    if (fields.catId !== undefined) mapped.cat_id = fields.catId;
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

// ── 把短期/长期的归属写回数据库 ────────────────────────────────────────────
// 显示本来就以 bucketOf() 为准，所以这一步只是让原版网站看到的也是对的。
// 失败了也无所谓，下次打开再写。
async function reconcileBuckets() {
  const drifted = tasks.filter(t => TIMED.includes(t.catId) && bucketOf(t) !== t.catId);
  if (!drifted.length) return;
  try {
    await Promise.all(drifted.map(t => {
      const b = bucketOf(t);
      t.catId = b;
      return sb.from('tasks').update({cat_id: b}).eq('id', t.id);
    }));
  } catch (e) { console.error('reconcileBuckets error', e); }
}

// ── 子任务 ────────────────────────────────────────────────────────────────

async function loadSubtasks() {
  subtasks = {};
  try {
    const {data} = await sb.from('subtasks').select('*')
      .eq('user_id', currentUser.id)
      .order('position', {ascending: true});
    (data || []).forEach(r => {
      (subtasks[r.task_id] = subtasks[r.task_id] || []).push(
        {id: r.id, text: r.text, done: r.done, position: r.position});
    });
  } catch (e) { console.error('loadSubtasks error', e); }
}

async function dbAddSub(taskId, text, position) {
  try {
    const {data, error} = await sb.from('subtasks')
      .insert({task_id: taskId, user_id: currentUser.id, text, position})
      .select().single();
    if (error) throw error;
    return {id: data.id, text: data.text, done: data.done, position: data.position};
  } catch (e) { console.error('dbAddSub error', e); return null; }
}

async function dbUpdateSub(id, fields) {
  try { await sb.from('subtasks').update(fields).eq('id', id); }
  catch (e) { console.error('dbUpdateSub error', e); }
}

async function dbDeleteSub(id) {
  try { await sb.from('subtasks').delete().eq('id', id); }
  catch (e) { console.error('dbDeleteSub error', e); }
}
