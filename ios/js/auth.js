// ── 登录 ──────────────────────────────────────────────────────────────────
// 后端还是原来那个 Supabase 项目，tasks 表、字段名全没动，
// 所以用原来的账号登录进来，数据就在那儿，不需要迁移。

// Supabase 的报错是英文的，挑常见的翻一下，其余原样抛出来
const AUTH_ERRORS = {
  'Invalid login credentials': '邮箱或密码不对',
  'Email not confirmed': '邮箱还没验证，去收件箱点一下确认链接',
  'User already registered': '这个邮箱已经注册过了，直接登录就行',
  'Password should be at least 6 characters': '密码至少 6 位',
  'Unable to validate email address: invalid format': '邮箱格式不对',
  'For security purposes, you can only request this after 60 seconds': '太频繁了，等 60 秒再试',
  'Email rate limit exceeded': '邮件发太多了，过一会儿再试',
};
function sayError(e) {
  if (!e) return '出了点问题，再试一次';
  if (AUTH_ERRORS[e.message]) return AUTH_ERRORS[e.message];
  for (const k in AUTH_ERRORS) if (e.message?.includes(k)) return AUTH_ERRORS[k];
  return e.message || '出了点问题，再试一次';
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function authMsg(text, kind) {
  const el = document.getElementById('auth-error');
  el.textContent = text || '';
  el.style.color = kind === 'ok' ? 'var(--green)'
                 : kind === 'info' ? 'var(--label-2)'
                 : 'var(--red)';
}

function authBusy(on, label) {
  const btn = document.getElementById('auth-btn');
  btn.disabled = on;
  btn.textContent = on ? '请稍候…' : label;
}

function currentLabel() {
  return authMode === 'login' ? '登录' : '注册';
}

// ── 两种状态：登录 / 注册 ─────────────────────────────────────────────────

function switchTab(mode) {
  authMode = mode;
  document.getElementById('tab-login').classList.toggle('on', mode === 'login');
  document.getElementById('tab-signup').classList.toggle('on', mode === 'signup');
  document.getElementById('auth-btn').textContent = currentLabel();
  document.getElementById('auth-btn').disabled = false;
  document.getElementById('auth-password').autocomplete = mode === 'login' ? 'current-password' : 'new-password';
  document.getElementById('link-resend').style.display = mode === 'signup' ? '' : 'none';
  authMsg('');
}

// ── 提交 ──────────────────────────────────────────────────────────────────

async function handleAuth() {
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;

  if (!email)                { authMsg('请填写邮箱'); return; }
  if (!EMAIL_RE.test(email)) { authMsg('邮箱格式不对'); return; }
  if (!password)             { authMsg('请填写密码'); return; }
  if (authMode === 'signup' && password.length < 6) { authMsg('密码至少 6 位'); return; }

  authMsg('');
  authBusy(true);

  try {
    const result = authMode === 'login'
      ? await sb.auth.signInWithPassword({email, password})
      : await sb.auth.signUp({email, password, options: {emailRedirectTo: location.href.split('#')[0]}});

    if (result.error) { authMsg(sayError(result.error)); authBusy(false, currentLabel()); return; }

    // 注册后如果项目开了邮箱验证，这里拿不到 session，要先去收邮件
    if (authMode === 'signup' && !result.data?.session) {
      authMsg('注册成功，去邮箱点一下确认链接再回来登录', 'ok');
      authBusy(false, currentLabel());
      return;
    }

    if (result.data?.session) await enterApp(result.data.session.user);
  } catch (e) {
    authMsg(sayError(e));
    authBusy(false, currentLabel());
  }
}

// ── 重发验证邮件 ──────────────────────────────────────────────────────────

async function resendConfirm() {
  const email = document.getElementById('auth-email').value.trim();
  if (!EMAIL_RE.test(email)) { authMsg('先填上邮箱'); return; }
  authBusy(true);
  const {error} = await sb.auth.resend({
    type: 'signup', email,
    options: {emailRedirectTo: location.href.split('#')[0]},
  });
  authBusy(false, currentLabel());
  authMsg(error ? sayError(error) : '确认邮件已重新发出', error ? 'err' : 'ok');
}

// ── 进入 / 离开 ───────────────────────────────────────────────────────────

async function enterApp(user) {
  currentUser = user;
  document.getElementById('auth-password').value = '';
  authMsg('');
  authBusy(false, currentLabel());
  showAuthOverlay(false);
  if (!sessionLoaded) {
    sessionLoaded = true;
    await loadTasks();
  }
}

async function handleLogout() {
  if (!confirm('确定要退出登录吗？')) return;
  closeMoreSheet();
  showLoading(true);
  try { await sb.auth.signOut(); }
  catch (e) { console.error('signOut error', e); }
  currentUser = null;
  tasks = [];
  sessionLoaded = false;
  switchTab('login');
  showAuthOverlay(true);
  showLoading(false);
  render();
}

function showAuthOverlay(v) {
  document.getElementById('auth').classList.toggle('hidden', !v);
}

// 两个输入框都支持回车直接提交
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  if (!e.target.closest('#auth') || document.getElementById('auth').classList.contains('hidden')) return;
  e.preventDefault();
  handleAuth();
});
