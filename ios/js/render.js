// ── 工具 ──────────────────────────────────────────────────────────────────

function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function parseDate(s) {
  if (!s) return null;
  const p = s.trim().split(" ");
  const [m, d] = p[0].split("/").map(Number);
  if (!m || !d) return null;
  const now = new Date();
  const dt = new Date(now.getFullYear(), m - 1, d);
  if (p[1]) { const [h, mn] = p[1].split(":").map(Number); dt.setHours(isNaN(h)?23:h, isNaN(mn)?59:mn, 0, 0); }
  else dt.setHours(23, 59, 0, 0);

  // 日期只存了「月/日」，没有年份。按当年解析的话，
  // 10 月填一条 01/07，会被算成今年 1 月 —— 逾期 268 天。
  // 落在半年以前的，一律当成明年。
  if (dt - now < -182 * 86400000) dt.setFullYear(dt.getFullYear() + 1);
  return dt;
}

function sortByDate(a) {
  return [...a].sort((x, y) => {
    const dx = parseDate(x.date), dy = parseDate(y.date);
    if (!dx && !dy) return 0; if (!dx) return 1; if (!dy) return -1; return dx - dy;
  });
}

// 提醒事项的写法：今天 / 明天 / 周几 / 月日，逾期标红
function dueLabel(dateStr) {
  const dt = parseDate(dateStr);
  if (!dt) return null;
  const now = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.floor((dt - midnight) / 86400000);
  const hm = dt.getHours() === 23 && dt.getMinutes() === 59
    ? '' : ` ${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;

  if (days < 0)   return {text: `${dt.getMonth()+1}月${dt.getDate()}日${hm}`, over: true};
  if (days === 0) return {text: `今天${hm}`, over: dt < now};
  if (days === 1) return {text: `明天${hm}`, over: false};
  if (days < 7)   return {text: `${WEEKDAYS[dt.getDay()]}${hm}`, over: false};
  return {text: `${dt.getMonth()+1}月${dt.getDate()}日${hm}`, over: false};
}

function catOf(id) { return CATS.find(c => c.id === id); }
function openOf(catId) { return tasks.filter(t => bucketOf(t) === catId && !t.done); }
function archived() { return tasks.filter(t => t.done && !catOf(bucketOf(t))?.grey); }

const ICONS = {
  repeat:'<path d="M4.6 10.4a5 5 0 0 1 5-5h9M15.2 2.4l3.4 3L15.2 8.4"/><path d="M19.4 13.6a5 5 0 0 1-5 5h-9M8.8 21.6l-3.4-3 3.4-3"/>',
  flame :'<path d="M12 2.8c3.4 3.6 6.4 6.4 6.4 10.4a6.4 6.4 0 1 1-12.8 0c0-4 3-6.8 6.4-10.4Z"/>',
  flag  :'<path d="M5.6 21V3.6M5.6 4.4h12.2l-2.4 4 2.4 4H5.6"/>',
  tray  :'<path d="M3.4 14.4h4.2l1.4 2.4h6l1.4-2.4h4.2"/><path d="M6.6 4.4h10.8l3.2 10v3.6a2.4 2.4 0 0 1-2.4 2.4H5.8a2.4 2.4 0 0 1-2.4-2.4v-3.6Z"/>',
  eye   :'<path d="M2.4 12s3.8-6.4 9.6-6.4S21.6 12 21.6 12 17.8 18.4 12 18.4 2.4 12 2.4 12Z"/><circle cx="12" cy="12" r="2.8"/>',
  check :'<circle cx="12" cy="12" r="9"/><path d="M8.2 12.3l2.7 2.7 5-5.4"/>',
  info  :'<circle cx="12" cy="12" r="9.2"/><path d="M12 10.8v5.6"/><circle cx="12" cy="7.9" r=".9" class="fill"/>',
  tickOk:'<path d="M4.8 12.6 9.6 17.2 19 7.2"/>',
  pencil:'<path d="M4.6 19.4h4L19.8 8.2l-4-4L4.6 15.4v4Z"/>',
  trash :'<path d="M4.6 7h14.8M9.6 7V4.6h4.8V7M6.6 7l1 12.4h8.8L17.4 7"/>',
};

// ── 渲染 ──────────────────────────────────────────────────────────────────

function render() {
  renderTiles();
  renderList();
  attachSwipe();
}

function renderTiles() {
  const html = CATS.map(c => {
    const n = openOf(c.id).length;
    const on = !showingArchive && activeCat === c.id;
    return `<button class="tile${on?' on':''}" style="--tile-tint:var(--${c.tint})"
        onclick="openCat('${c.id}')" ${on?'aria-current="true"':''}>
        <span class="tile-top">
          <span class="tile-ico"><svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[c.icon]}</svg></span>
          <span class="tile-count">${n}</span>
        </span>
        <span class="tile-name">${esc(c.label)}</span>
      </button>`;
  }).join('');

  const an = archived().length;
  const onArch = showingArchive;
  document.getElementById('tiles').innerHTML = html +
    `<button class="tile${onArch?' on':''}" style="--tile-tint:var(--gray)"
      onclick="openArchive()" ${onArch?'aria-current="true"':''}>
      <span class="tile-top">
        <span class="tile-ico"><svg viewBox="0 0 24 24" aria-hidden="true">${ICONS.check}</svg></span>
        <span class="tile-count">${an}</span>
      </span>
      <span class="tile-name">已完成</span>
    </button>`;
}

function renderList() {
  const head = document.getElementById('list-head');
  const box = document.getElementById('entries');

  if (showingArchive) {
    const list = archived();
    head.innerHTML = `<b>已完成</b><span>${list.length} 项</span>`;
    box.innerHTML = list.map(t => itemHtml(t, catOf(bucketOf(t)), true, true)).join('');
    if (!list.length) box.innerHTML = emptyHtml('check', '没有已完成的提醒',
      '划掉的短期、长期、无期限会收到这里。日常和偶尔关注每天重置。');
    return;
  }

  const cat = catOf(activeCat);
  if (!cat) return;
  const all = tasks.filter(t => bucketOf(t) === activeCat);
  const open = all.filter(t => !t.done);
  const done = cat.grey ? all.filter(t => t.done) : [];
  const list = cat.hasDate ? sortByDate(open) : open;

  head.innerHTML = `<b>${esc(cat.label)}</b><span>${open.length} 项未完成</span>`;

  if (!list.length && !done.length) {
    box.innerHTML = emptyHtml(cat.icon, '没有提醒', '点下方「新建」添加一项。');
    return;
  }
  box.innerHTML = list.map(t => itemHtml(t, cat, false, false)).join('')
                + done.map(t => itemHtml(t, cat, true, false)).join('');
}

function itemHtml(t, cat, isDone, isArchive) {
  const tint = cat ? cat.tint : 'gray';
  const due = cat?.hasDate ? dueLabel(t.date) : null;
  const prio = priorityOf(t.importance);

  const subBits = [];
  if (due) subBits.push(`<span class="${due.over && !isDone ? 'past' : ''}">${due.text}</span>`);
  if (isArchive && cat) subBits.push(`<span>${esc(cat.label)}</span>`);
  const sub = subBits.length ? `<span class="item-sub">${subBits.join('')}</span>` : '';

  return `<div class="item${isDone?' done':''}" id="item-${t.id}" data-prio="${prio.v}" style="--item-tint:var(--${tint})">
    <div class="item-acts">
      <button class="act act-edit" onclick="openEditSheet(${t.id})" aria-label="详细信息">
        <svg viewBox="0 0 24 24" aria-hidden="true">${ICONS.pencil}</svg>
      </button>
      <button class="act act-del" onclick="deleteTask(${t.id})" aria-label="删除">
        <svg viewBox="0 0 24 24" aria-hidden="true">${ICONS.trash}</svg>
      </button>
    </div>
    <div class="item-in" data-id="${t.id}">
      <button class="tick" onclick="toggleDone(${t.id})"
        aria-label="${isDone?'标记为未完成':'标记为已完成'}：${esc(t.text)}${prio.v ? '，' + prio.label : ''}">
        <svg viewBox="0 0 24 24" aria-hidden="true">${ICONS.tickOk}</svg>
      </button>
      <span class="item-body">
        <span class="item-title">${esc(t.text)}</span>
        ${sub}
      </span>
      <button class="item-info" onclick="openEditSheet(${t.id})" aria-label="详细信息：${esc(t.text)}">
        <svg viewBox="0 0 24 24" aria-hidden="true">${ICONS.info}</svg>
      </button>
    </div>
  </div>`;
}

function emptyHtml(icon, title, note) {
  return `<div class="empty">
    <div class="empty-ico"><svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[icon] || ICONS.tray}</svg></div>
    <b>${esc(title)}</b><span>${esc(note)}</span>
  </div>`;
}

// ── 切换列表 ──────────────────────────────────────────────────────────────

function openCat(id) {
  activeCat = id; showingArchive = false;
  localStorage.setItem('ddl-cat', id);
  render();
  document.getElementById('scroll').scrollTo({top: 0, behavior: 'smooth'});
}

function openArchive() {
  showingArchive = true;
  render();
  document.getElementById('scroll').scrollTo({top: 0, behavior: 'smooth'});
}
