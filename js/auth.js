// ── Auth UI ───────────────────────────────────────────────────────────────

function switchTab(mode) {
  authMode = mode;
  document.getElementById('tab-login').classList.toggle('active', mode === 'login');
  document.getElementById('tab-signup').classList.toggle('active', mode === 'signup');
  document.getElementById('auth-btn').textContent = mode === 'login' ? '登录' : '注册';
  document.getElementById('auth-error').textContent = '';
}

async function handleAuth() {
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  const errEl = document.getElementById('auth-error');
  errEl.textContent = '';
  if (!email || !password) { errEl.textContent = '请填写邮箱和密码'; return; }
  document.getElementById('auth-btn').textContent = '请稍候…';
  let result;
  if (authMode === 'login') {
    result = await sb.auth.signInWithPassword({email, password});
  } else {
    result = await sb.auth.signUp({email, password});
  }
  if (result.error) {
    errEl.textContent = result.error.message === 'Invalid login credentials' ? '邮箱或密码错误' : result.error.message;
    document.getElementById('auth-btn').textContent = authMode === 'login' ? '登录' : '注册';
  } else if (authMode === 'signup' && !result.data?.session) {
    errEl.style.color = '#00704a';
    errEl.textContent = '注册成功！请检查邮箱验证后登录';
    document.getElementById('auth-btn').textContent = '注册';
  } else if (result.data?.session) {
    // 登录成功：直接在这里切换 UI，不依赖 onAuthStateChange
    currentUser = result.data.session.user;
    showAuthOverlay(false);
    if (!sessionLoaded) {
      sessionLoaded = true;
      await loadTasks();
    }
  }
}

async function handleLogout() {
  if (!confirm('确认退出登录？')) return;
  showLoading(true);
  try {
    await sb.auth.signOut();
  } catch(e) {
    console.error('signOut error', e);
  }
  currentUser = null;
  tasks = [];
  sessionLoaded = false;
  showAuthOverlay(true);
  showLoading(false);
  render();
}

function showAuthOverlay(v) {
  document.getElementById('auth-overlay').classList.toggle('hidden', !v);
}
