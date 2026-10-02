// ── 完成记录 ──────────────────────────────────────────────────────────────
// 原来这里是购物车 + 账单收据 + ￥9.9 的钱包。现在只留一件事：
// 记下哪天划掉了什么。日常类每天重置，不记账就查不到，所以这份流水还是要存。

const LOG_KEY = 'ddl-log';

function getLog() {
  try { return JSON.parse(localStorage.getItem(LOG_KEY) || '[]'); } catch { return []; }
}

function saveLog(rows) {
  try { localStorage.setItem(LOG_KEY, JSON.stringify(rows.slice(-800))); } catch {}
}

function logDone(task) {
  const rows = getLog();
  rows.push({ts: Date.now(), date: TODAY, text: task.text, catId: task.catId});
  saveLog(rows);
}

function unlogDone(task) {
  const rows = getLog();
  for (let i = rows.length - 1; i >= 0; i--) {
    if (rows[i].date === TODAY && rows[i].text === task.text) { rows.splice(i, 1); break; }
  }
  saveLog(rows);
}

// ── 面板 ──────────────────────────────────────────────────────────────────


function renderLog() {
  const rows = getLog();
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay());
  weekStart.setHours(0, 0, 0, 0);

  const today = rows.filter(r => r.date === TODAY).length;
  const week  = rows.filter(r => new Date(r.ts) >= weekStart).length;

  document.getElementById('log-stats').innerHTML = `
    <div class="stat-row">
      <div class="stat"><b>${today}</b><span>今天</span></div>
      <div class="stat"><b>${week}</b><span>本周</span></div>
      <div class="stat"><b>${rows.length}</b><span>累计</span></div>
    </div>`;

  const list = document.getElementById('log-list');
  if (rows.length === 0) {
    list.innerHTML = '<div class="log-none">还没有完成过任何提醒</div>';
    return;
  }

  const byDay = {};
  rows.forEach(r => { (byDay[r.date] = byDay[r.date] || []).push(r); });

  list.innerHTML = Object.keys(byDay).sort().reverse().slice(0, 30).map(date => {
    const [, m, d] = date.split('-');
    const items = [...byDay[date]].reverse().map(r => {
      const t = new Date(r.ts);
      const hh = String(t.getHours()).padStart(2, '0');
      const mm = String(t.getMinutes()).padStart(2, '0');
      return `<div class="log-row">
        <span class="log-when">${parseInt(m)}/${parseInt(d)} ${hh}:${mm}</span>
        <span class="log-what">${esc(r.text)}</span>
      </div>`;
    }).join('');
    return items;
  }).join('');
}
