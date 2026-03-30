// ── Nav scroll listener ───────────────────────────────────────────────────

document.getElementById("main").addEventListener("scroll", function() {
  if (scrollingProg) return;
  const top = this.scrollTop + 80;
  let cur = null;
  CATS.forEach(cat => { const s = document.getElementById(`sec-${cat.id}`); if (s && s.offsetTop <= top) cur = cat.id; });
  updateNavHighlight(cur);
}, {passive: true});

// ── App startup ───────────────────────────────────────────────────────────

applyTheme(currentTheme);
showLoading(true);
render();

// ── Auth state listener ───────────────────────────────────────────────────
// 只监听 SIGNED_IN / SIGNED_OUT，不依赖不稳定的 INITIAL_SESSION 事件

// 只处理服务端强制下线（token 过期/被撤销），不处理 SIGNED_IN
// 登录由 handleAuth 直接处理，页面加载由 initSession 处理
sb.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_OUT' && !currentUser) return; // handleLogout 已处理，忽略重复事件
  if (event === 'SIGNED_OUT') {
    currentUser = null; tasks = [];
    sessionLoaded = false;
    showAuthOverlay(true);
    showLoading(false);
    render();
  }
});

// ── 初始 session 恢复（页面加载时唯一入口）────────────────────────────────

(async function initSession() {
  try {
    const {data: {session}} = await sb.auth.getSession();
    if (session && session.user) {
      currentUser = session.user;
      showAuthOverlay(false);
      if (!sessionLoaded) {
        sessionLoaded = true;
        await loadTasks();
      }
    } else {
      // 无有效 session，显示登录界面
      showAuthOverlay(true);
      showLoading(false);
    }
  } catch(e) {
    console.error('initSession error', e);
    showAuthOverlay(true);
    showLoading(false);
  }
})();