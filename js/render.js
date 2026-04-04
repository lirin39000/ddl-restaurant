// ── Helpers ───────────────────────────────────────────────────────────────

function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function parseDate(s) {
  if (!s) return null;
  const p = s.trim().split(" ");
  const [m, d] = p[0].split("/").map(Number);
  if (!m || !d) return null;
  const dt = new Date(new Date().getFullYear(), m - 1, d);
  if (p[1]) { const [h, mn] = p[1].split(":").map(Number); dt.setHours(isNaN(h)?23:h, isNaN(mn)?59:mn, 0, 0); }
  else dt.setHours(23, 59, 0, 0);
  return dt;
}

function sortByDate(a) {
  return [...a].sort((a, b) => {
    const da = parseDate(a.date), db = parseDate(b.date);
    if (!da && !db) return 0; if (!da) return 1; if (!db) return -1; return da - db;
  });
}

function foodEmoji(t, c) { return c.foods[t.id % c.foods.length]; }
function taskDesc(t, c) { return c.descs[t.id % c.descs.length]; }

function priceDisplay(t, c) {
  if (c.id === 'watch') return `<span style="font-size:13px;font-weight:900">￥随时补货</span>`;
  if (t.date) return `<span style="font-size:12px">￥</span>${esc(t.date)}`;
  if (c.grey) return `<span style="font-size:12px">￥</span>每日供应`;
  return `<span style="font-size:12px">￥</span>随时可取`;
}

function todayCart() { return tasks.filter(t => t.done && t.doneDate === TODAY); }
function allArchived() { return tasks.filter(t => { const c = CATS.find(x => x.id === t.catId); return t.done && !c?.grey; }); }

// ── Render ────────────────────────────────────────────────────────────────

function render() {
  const dn = new Date();
  document.getElementById("header-date").textContent = `${dn.getMonth()+1}月${dn.getDate()}日 ${WEEKDAYS[dn.getDay()]}`;
  let html = "";
  CATS.forEach(cat => {
    const allCat = tasks.filter(t => t.catId === cat.id);
    const active = allCat.filter(t => !t.done);
    const doneGrey = cat.grey ? allCat.filter(t => t.done) : [];
    const sorted = cat.hasDate ? sortByDate(active) : active;
    const activeCount = active.length;
    const badge = document.getElementById(`badge-${cat.id}`);
    if (badge) { badge.textContent = activeCount; badge.style.display = activeCount > 0 ? 'flex' : 'none'; }
    html += `<div class="section" id="sec-${cat.id}">`;
    html += `<div class="section-header"><span>${cat.emoji}</span>${cat.label}<span class="section-badge">${activeCount}份</span><button class="add-section-btn" onclick="toggleAdd('${cat.id}')">+ 加单</button></div>`;
    if (sorted.length === 0 && doneGrey.length === 0) html += `<div class="empty-hint">暂无任务，点击「加单」添加菜品 🍽</div>`;
    sorted.forEach(t => {
      html += `<div class="card-wrap" id="wrap-${t.id}">
        <div class="card-actions-bg" id="actbg-${t.id}">
          <div class="card-action-edit" onclick="openEditModal(${t.id})"><span>✏️</span><div class="card-action-label">编辑</div></div>
          <div class="card-action-delete" onclick="deleteTask(${t.id})"><span>🗑️</span><div class="card-action-label">删除</div></div>
        </div>
        <div class="task-card" id="card-${t.id}" data-id="${t.id}">
          <div class="food-img-wrap"><div class="food-img" style="background:${importanceBgColor(t.importance||0,cat)}">${foodEmoji(t,cat)}</div></div>
          <div class="task-info"><div class="task-name">${esc(t.text)}</div><div class="task-desc">${esc(taskDesc(t,cat))}</div><div class="task-ddl">${priceDisplay(t,cat)}</div></div>
          <button class="add-btn" ontouchend="handleComplete(event,${t.id})" onclick="handleComplete(event,${t.id})">+</button>
        </div>
      </div>`;
    });
    doneGrey.forEach(t => {
      html += `<div class="card-wrap" id="wrap-${t.id}">
        <div class="card-actions-bg" id="actbg-${t.id}">
          <div class="card-action-edit" onclick="openEditModal(${t.id})"><span>✏️</span><div class="card-action-label">编辑</div></div>
          <div class="card-action-delete" onclick="deleteTask(${t.id})"><span>🗑️</span><div class="card-action-label">删除</div></div>
        </div>
        <div class="task-card done" id="card-${t.id}" data-id="${t.id}">
          <div class="food-img-wrap"><div class="food-img" style="background:${importanceBgColor(t.importance||0,cat)}">${foodEmoji(t,cat)}</div></div>
          <div class="task-info"><div class="task-name">${esc(t.text)}</div><div class="task-desc">${esc(taskDesc(t,cat))}</div><div class="task-ddl">${priceDisplay(t,cat)}</div></div>
          <button class="add-btn done-btn">✓</button>
        </div>
      </div>`;
    });
    html += `</div>`;
  });
  const archived = allArchived();
  const cbadge = document.getElementById("badge-completed");
  if (cbadge) { cbadge.textContent = archived.length; cbadge.style.display = archived.length > 0 ? 'flex' : 'none'; }
  html += `<div id="completed-section" style="display:${completedOpen?'block':'none'};background:#fff;margin-bottom:8px;">`;
  html += `<div class="section-header" style="background:#f8f8f8"><span>🧾</span>已完成<span class="completed-count-badge">${archived.length}项</span>${archived.length>0?'<button class="clear-completed-btn" onclick="clearAllCompleted()">清空</button>':''}</div>`;
  if (archived.length === 0) html += `<div class="empty-hint">暂无已归档任务</div>`;
  else archived.forEach(t => {
    const cat = CATS.find(c => c.id === t.catId);
    html += `<div class="completed-task-card">
      <div class="completed-food-wrap"><div class="completed-food-icon" style="background:${importanceBgColor(t.importance||0,cat||CATS[0])}">${foodEmoji(t,cat||CATS[0])}</div></div>
      <div class="completed-task-info"><div class="completed-task-name">${esc(t.text)}</div><div class="completed-task-meta">${cat?.label||''}${t.date?' · '+t.date:''}</div></div>
      <button class="restore-btn" onclick="restoreTask(${t.id})">恢复</button>
    </div>`;
  });
  html += `</div><div style="height:20px"></div>`;
  document.getElementById("main").innerHTML = html;
  updateCartBar();
  updateNavHighlight();
  attachSwipeListeners();
}

function updateCartBar() {
  const ct = todayCart();
  const bar = document.getElementById("cart-bar");
  if (ct.length === 0) { bar.classList.add("hidden"); return; }
  bar.classList.remove("hidden");
  document.getElementById("cart-count").textContent = ct.length;
  document.getElementById("cart-total-num").textContent = (ct.length * 9.9).toFixed(1);
}
