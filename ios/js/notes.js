// ── 小记 ──────────────────────────────────────────────────────────────────
// 做成「自己给自己发消息」：几个会话窗口当分类用（设计课程 / 留学规划…），
// 每条小记是一个气泡，左边挂一个「已阅」勾，点掉就删。
// 图片存私有桶，读取走签名 URL —— 小记是很私人的东西，不做公开直链。

let threads = [];
let notes = [];                 // 当前打开的那个会话
let activeThread = null;
const signedCache = new Map();  // image_path → 签名后的 url

function notesBack() {
  if (activeThread) { showThreadList(); loadThreads(); }
  else closeNotes();
}

function notesOpen() {
  return document.getElementById('notes-screen').classList.contains('show');
}

// ── 进出 ──────────────────────────────────────────────────────────────────

async function openNotes() {
  document.getElementById('notes-screen').classList.add('show');
  showThreadList();
  await loadThreads();
}

function closeNotes() {
  document.getElementById('notes-screen').classList.remove('show');
  activeThread = null;
}

function showThreadList() {
  activeThread = null;
  document.getElementById('notes-screen').classList.remove('in-thread');
  document.getElementById('notes-title').textContent = '小记';
}

// ── 会话 ──────────────────────────────────────────────────────────────────

async function loadThreads() {
  try {
    const {data} = await sb.from('note_threads').select('*')
      .eq('user_id', currentUser.id).order('created_at', {ascending: true});
    threads = data || [];
    // 每个会话的条数和最后一条，用来做列表的预览行
    const {data: all} = await sb.from('notes').select('thread_id,text,image_path,created_at')
      .eq('user_id', currentUser.id).order('created_at', {ascending: false});
    const seen = {};
    (all || []).forEach(n => {
      seen[n.thread_id] = seen[n.thread_id] || {count: 0, last: n};
      seen[n.thread_id].count++;
    });
    threads.forEach(t => {
      t.count = seen[t.id]?.count || 0;
      t.last = seen[t.id]?.last || null;
    });
  } catch (e) { console.error('loadThreads error', e); threads = []; }
  renderThreads();
}

function renderThreads() {
  const box = document.getElementById('thread-list');
  if (!threads.length) {
    box.innerHTML = `<div class="empty">
      <div class="empty-ico"><svg viewBox="0 0 24 24" aria-hidden="true">${ICONS.chat}</svg></div>
      <b>还没有小记</b><span>新建一个窗口，把零碎的想法丢进去。</span></div>`;
    return;
  }
  box.innerHTML = `<div class="group">` + threads.map(t => {
    const prev = t.last
      ? (t.last.text ? esc(t.last.text) : '［图片］')
      : '还没有内容';
    return `<button class="row row--tap thread-row" onclick="openThread(${t.id})">
      <span class="thread-ava" aria-hidden="true">${esc(t.title.trim().slice(0,1) || '记')}</span>
      <span class="thread-mid">
        <span class="thread-name">${esc(t.title)}</span>
        <span class="thread-prev">${prev}</span>
      </span>
      <span class="thread-tail">
        ${t.count ? `<span class="thread-count">${t.count}</span>` : ''}
        <svg class="thread-chev" viewBox="0 0 24 24" aria-hidden="true">${ICONS.chev}</svg>
      </span>
    </button>`;
  }).join('') + `</div>`;
}

async function newThread() {
  const title = prompt('给这个窗口起个名字', '');
  if (!title || !title.trim()) return;
  try {
    const {data, error} = await sb.from('note_threads')
      .insert({user_id: currentUser.id, title: title.trim()}).select().single();
    if (error) throw error;
    await loadThreads();
    openThread(data.id);
  } catch (e) { console.error('newThread error', e); }
}

async function deleteThread() {
  const t = threads.find(x => x.id === activeThread);
  if (!t) return;
  if (!confirm(`删除「${t.title}」？里面的 ${t.count || 0} 条小记会一起删掉。`)) return;
  try { await sb.from('note_threads').delete().eq('id', t.id); }
  catch (e) { console.error('deleteThread error', e); }
  showThreadList();
  await loadThreads();
}

// ── 单个会话 ──────────────────────────────────────────────────────────────

async function openThread(id) {
  activeThread = id;
  const t = threads.find(x => x.id === id);
  document.getElementById('notes-title').textContent = t ? t.title : '小记';
  document.getElementById('notes-screen').classList.add('in-thread');
  document.getElementById('bubbles').innerHTML = '';
  await loadNotes();
  document.getElementById('note-text')?.focus();
}

async function loadNotes() {
  try {
    const {data} = await sb.from('notes').select('*')
      .eq('user_id', currentUser.id).eq('thread_id', activeThread)
      .order('created_at', {ascending: true});
    notes = data || [];
  } catch (e) { console.error('loadNotes error', e); notes = []; }
  await signImages();
  renderBubbles();
}

// 私有桶取不到直链，得换签名 URL，一次把这屏要用的都换完
async function signImages() {
  const need = notes.map(n => n.image_path).filter(p => p && !signedCache.has(p));
  if (!need.length) return;
  try {
    const {data} = await sb.storage.from('note-images').createSignedUrls(need, 60 * 60 * 6);
    (data || []).forEach(r => { if (r.signedUrl) signedCache.set(r.path, r.signedUrl); });
  } catch (e) { console.error('signImages error', e); }
}

function stamp(iso) {
  const d = new Date(iso);
  const n = new Date();
  const hm = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  const sameDay = d.toDateString() === n.toDateString();
  return sameDay ? hm : `${d.getMonth()+1}月${d.getDate()}日 ${hm}`;
}

function renderBubbles() {
  const box = document.getElementById('bubbles');
  if (!notes.length) {
    box.innerHTML = `<div class="bubble-empty">把想法发给自己。<br>看完点左边的勾就消失。</div>`;
    return;
  }
  box.innerHTML = notes.map(n => {
    // 图和文字各自成泡 —— 糊在一起的话白字会压在图上读不了
    const src = n.localUrl || (n.image_path && signedCache.get(n.image_path));
    const img = src
      ? `<img class="bubble-img" src="${src}" alt="小记图片" loading="lazy"/>` : '';
    const txt = n.text ? `<div class="bubble">${esc(n.text)}</div>` : '';
    const state = n.failed ? `<span class="bubble-state failed">${esc(n.failed)}</span>`
                : n.pending ? `<span class="bubble-state">发送中…</span>` : '';
    return `<div class="bubble-row${n.pending?' pending':''}">
      <button class="read-btn" onclick="markRead('${n.id}')" aria-label="已阅并删除这条小记">
        <svg viewBox="0 0 24 24" aria-hidden="true">${ICONS.tickOk}</svg>
      </button>
      <div class="bubble-wrap">
        ${img}${txt}
        <span class="bubble-time">${state || stamp(n.created_at)}</span>
      </div>
    </div>`;
  }).join('');
  box.scrollTop = box.scrollHeight;
}

// ── 发一条 ────────────────────────────────────────────────────────────────

// 乐观渲染：气泡先出来，网络在后台跑。
// 原来是 await 完插入才渲染，所以每发一条都要等一次到新加坡的往返；
// 图片更慢 —— 上传 + 插入 + 换签名 URL，三次往返全等完才看得到。
let tempSeq = 0;

async function sendNote() {
  const input = document.getElementById('note-text');
  const text = input.value.trim();
  if (!text || !activeThread) return;
  input.value = '';
  autoGrow(input);

  const temp = {
    id: `tmp${++tempSeq}`, thread_id: activeThread,
    text, image_path: null, created_at: new Date().toISOString(), pending: true,
  };
  notes.push(temp);
  renderBubbles();                       // 立刻可见

  const row = await insertNote({text, image_path: null});
  swapTemp(temp.id, row);
}

async function pickImage(input) {
  const file = input.files?.[0];
  input.value = '';
  if (!file || !activeThread) return;

  // 本地直接生成预览，不等上传
  const localUrl = URL.createObjectURL(file);
  const temp = {
    id: `tmp${++tempSeq}`, thread_id: activeThread,
    text: null, image_path: null, localUrl,
    created_at: new Date().toISOString(), pending: true,
  };
  notes.push(temp);
  renderBubbles();

  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const path = `${currentUser.id}/${Date.now()}-${Math.random().toString(36).slice(2,8)}.${ext}`;
  try {
    const {error} = await sb.storage.from('note-images')
      .upload(path, file, {contentType: file.type, upsert: false});
    if (error) throw error;
    const row = await insertNote({text: null, image_path: path});
    // 本地那张先留着当缓存，省掉一次换签名 URL 的往返
    if (row) signedCache.set(path, localUrl);
    swapTemp(temp.id, row);
  } catch (e) {
    console.error('pickImage error', e);
    markFailed(temp.id, '图片没传上去');
  }
}

async function insertNote(payload) {
  try {
    const {data, error} = await sb.from('notes')
      .insert({thread_id: activeThread, user_id: currentUser.id, ...payload})
      .select().single();
    if (error) throw error;
    return data;
  } catch (e) { console.error('insertNote error', e); return null; }
}

// 服务器回包后把临时气泡换成真的；失败就标出来，别让它假装成功
function swapTemp(tempId, row) {
  const i = notes.findIndex(n => n.id === tempId);
  if (i < 0) return;                     // 期间被「已阅」掉了
  if (!row) { markFailed(tempId, '没发出去'); return; }
  const localUrl = notes[i].localUrl;
  notes[i] = localUrl ? {...row, localUrl} : row;
  renderBubbles();
}

function markFailed(tempId, why) {
  const n = notes.find(x => x.id === tempId);
  if (!n) return;
  n.pending = false; n.failed = why;
  renderBubbles();
}

// ── 已阅 = 删掉 ───────────────────────────────────────────────────────────

async function markRead(id) {
  const key = String(id);
  const n = notes.find(x => String(x.id) === key);
  notes = notes.filter(x => String(x.id) !== key);
  renderBubbles();
  if (!n || key.startsWith('tmp')) return;   // 还没落库，删了也没用
  try {
    await sb.from('notes').delete().eq('id', n.id);
    if (n?.image_path) {
      await sb.storage.from('note-images').remove([n.image_path]);
      signedCache.delete(n.image_path);
    }
  } catch (e) { console.error('markRead error', e); }
}

// 输入框跟着内容长高，和短信一样
function autoGrow(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 110) + 'px';
}
