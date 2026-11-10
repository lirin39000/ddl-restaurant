// ── Database operations ───────────────────────────────────────────────────

// 上次看到的数据存在本地，下次开屏直接画出来，不用干等网络往返。
// 服务器回来后再覆盖 —— 这样从主屏点开是「立刻有内容」而不是转圈。
const CACHE_KEY = 'ddl-cache-v1';

function saveCache() {
  if (!currentUser) return;          // 没登录别拿空数据把缓存冲掉
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      at: Date.now(), uid: currentUser?.id, tasks, subtasks,
    }));
  } catch (e) {}
}

// 启动时就调，不等认证。
// 原来这里要求 c.uid === currentUser?.id，可启动那一刻 currentUser 还是
// null，于是缓存永远读不到 —— 等于白存了。先画出来，服务器回来再覆盖。
let cachedUid = null;

function primeFromCache() {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    if (!c || !c.tasks || !c.tasks.length) return false;
    cachedUid = c.uid;
    tasks = c.tasks;
    subtasks = c.subtasks || {};
    return true;
  } catch (e) { return false; }
}

function clearCache() {
  try { localStorage.removeItem(CACHE_KEY); } catch (e) {}
  cachedUid = null;
}

// ── 本地改动的时刻表 ──────────────────────────────────────────────────────
// loadTasks 过去是 tasks = 服务器结果，整盘换掉。
// 自从首屏改成从缓存秒开，加载那一两秒里人已经能操作了 ——
// 这期间新加的任务会被随后返回的查询结果抹掉：出现一下就又没了。
// 查询返回的是「发出那一刻」的样子，不含这之后的改动，
// 所以凡是在查询发出之后动过的 id，合并时一律以本地为准。
const touchedAt = new Map();
function markLocal(id) { touchedAt.set(id, Date.now()); }

function mergeLocal(fresh, sel) {
  const keep = new Set();
  touchedAt.forEach((at, id) => { if (at >= sel) keep.add(id); });
  tasks.forEach(t => { if (t.unsynced) keep.add(t.id); });   // 没存上的更不能丢

  const out = fresh.filter(r => !keep.has(r.id));
  keep.forEach(id => {
    const local = tasks.find(t => t.id === id);
    // 本地删掉的不在 tasks 里，服务器那份上面也已经剔除了 —— 删除照样生效
    if (local) out.push(local);
  });

  const cut = Date.now() - 300000;   // 五分钟前的记录没用了，别越积越多
  touchedAt.forEach((at, id) => { if (at < cut) touchedAt.delete(id); });
  return out.sort((a, b) => a.id - b.id);
}

async function loadTasks() {
  // 换了账号的话，缓存里是别人的数据，先清掉
  if (cachedUid && cachedUid !== currentUser?.id) {
    tasks = []; subtasks = {}; touchedAt.clear(); clearCache(); render();
  }
  // 屏幕上已经有东西就别再转圈了
  if (!tasks.length) showLoading(true);

  const sel = Date.now();        // 查询发出的时刻，合并时要用
  try {
    const {data, error} = await sb.from('tasks').select('*').eq('user_id', currentUser.id).order('id', {ascending: true});
    if (data) {
      const fresh = data.map(r => ({
        id: Number(r.id), catId: r.cat_id, text: r.text,
        date: r.date, dueAt: r.due_at, allDay: r.all_day !== false,
        importance: r.importance || 0,
        done: r.done, doneDate: r.done_date,
        subMode: r.sub_mode || 'task',
      }));
      tasks = mergeLocal(fresh, sel);
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
  await loadSubtasks(sel);
  showLoading(false);
  render();
  saveCache();
  reconcileBuckets();   // 不 await：写回是后台的事，不该拖住首屏
  flushUnsynced();      // 上次没存上的，趁网络好补上
}

// ── 没存上的留着重试，不许偷偷丢 ──────────────────────────────────────────
// 原来插入失败就把它从 tasks 里 filter 掉，连句提示都没有 ——
// 任务在屏幕上闪一下就不见了。现在失败的留在原地标成「未同步」，
// 网络恢复、切回前台、或者隔一会儿自己重试。
let flushTimer = null;

async function flushUnsynced() {
  clearTimeout(flushTimer);
  if (!currentUser) return;
  const stuck = tasks.filter(t => t.unsynced);
  if (!stuck.length) return;

  let fixed = 0;
  for (const t of stuck) {
    if ((await dbInsert(t, true)) != null) { delete t.unsynced; fixed++; }
  }
  render();
  saveCache();
  if (fixed) toast(fixed === stuck.length ? '刚才没存上的已经补上了' : `补上 ${fixed} 项，还有没存上的`);
  if (tasks.some(t => t.unsynced)) flushTimer = setTimeout(flushUnsynced, 20000);
}

window.addEventListener('online', flushUnsynced);

// upsert 只给重试用：第一次有可能其实已经写进去了、只是回包丢了，
// 再 insert 会撞主键，永远补不上。upsert 是幂等的。
async function dbInsert(task, upsert) {
  const row = {
    id: task.id, user_id: currentUser.id, cat_id: task.catId, text: task.text,
    date: task.date, due_at: task.dueAt || null, all_day: task.allDay !== false,
    importance: task.importance || 0,
    done: task.done, done_date: task.doneDate, sub_mode: task.subMode || 'task',
  };
  try {
    const {error} = upsert
      ? await sb.from('tasks').upsert(row)
      : await sb.from('tasks').insert(row);
    if (error) throw error;
    return task.id;
  } catch(e) { console.error('dbInsert error', e); return null; }
}

async function dbUpdate(id, fields) {
  try {
    const mapped = {};
    if (fields.catId !== undefined) mapped.cat_id = fields.catId;
    if (fields.dueAt !== undefined) mapped.due_at = fields.dueAt;
    if (fields.allDay !== undefined) mapped.all_day = fields.allDay;
    if (fields.subMode !== undefined) mapped.sub_mode = fields.subMode;
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

async function loadSubtasks(sel) {
  // 和任务一样：查询发出之后本地动过的，整条以本地为准
  const held = {};
  if (sel) touchedAt.forEach((at, id) => {
    if (at >= sel && subtasks[id]) held[id] = subtasks[id];
  });

  const next = {};
  let got = false;
  try {
    const {data} = await sb.from('subtasks').select('*')
      .eq('user_id', currentUser.id)
      .order('position', {ascending: true});
    got = !!data;
    (data || []).forEach(r => {
      (next[r.task_id] = next[r.task_id] || []).push(
        {id: r.id, taskId: r.task_id, text: r.text, done: r.done,
         position: r.position, doneAt: r.done_at});
    });
  } catch (e) { console.error('loadSubtasks error', e); }

  if (!got) return;          // 没查到就留着缓存里那份，别拿空的盖掉
  Object.assign(next, held);
  subtasks = next;
}

async function dbAddSub(taskId, text, position) {
  try {
    const {data, error} = await sb.from('subtasks')
      .insert({task_id: taskId, user_id: currentUser.id, text, position})
      .select().single();
    if (error) throw error;
    return {id: data.id, taskId: taskId, text: data.text, done: data.done,
            position: data.position, doneAt: data.done_at};
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
