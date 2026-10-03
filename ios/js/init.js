// ── 启动 ──────────────────────────────────────────────────────────────────

activeCat = localStorage.getItem('ddl-cat') || 'daily';
if (!CATS.some(c => c.id === activeCat)) activeCat = 'daily';

applyAppearance(currentAppearance);
watchScroll();
showLoading(true);
render();

// 手机上应用常常挂在后台好几天，回到前台时日期已经变了 ——
// 重算一遍归属，否则「还剩 1 天」会一直停在昨天的结论上。
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !currentUser) return;
  render();
  reconcileBuckets();
});

// 抽屉打开时按 Esc 关掉
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  ['add-sheet', 'edit-sheet', 'more-sheet'].forEach(id => {
    document.getElementById(id).classList.remove('show');
  });
  if (document.getElementById('notes-screen').classList.contains('show')) notesBack();
});

// ── 登录状态 ──────────────────────────────────────────────────────────────
// 只处理服务端强制下线（token 过期/被撤销）。
// 登录由 handleAuth 直接处理，页面加载由 initSession 处理。

sb.auth.onAuthStateChange(async (event, session) => {
  if (event === 'SIGNED_OUT') {
    if (!currentUser) return;                 // handleLogout 已经处理过了
    currentUser = null; tasks = []; sessionLoaded = false;
    switchTab('login');
    showAuthOverlay(true);
    showLoading(false);
    render();
    return;
  }

  // 刷新 token 失败会走 SIGNED_OUT；成功的话静默更新就行
  if (event === 'TOKEN_REFRESHED' && session?.user) {
    currentUser = session.user;
    return;
  }

  // 改完密码 Supabase 会发 USER_UPDATED
  if (event === 'USER_UPDATED' && session?.user) {
    currentUser = session.user;
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
      showAuthOverlay(true);
      showLoading(false);
    }
  } catch (e) {
    console.error('initSession error', e);
    showAuthOverlay(true);
    showLoading(false);
  }
})();
