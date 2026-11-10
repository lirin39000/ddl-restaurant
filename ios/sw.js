// ══════════════════════════════════════════════════════════════════════════
// Service Worker：把 app 的壳子（HTML/CSS/JS/SDK/图标）存在本地。
// 从主屏点开时不再等网络 —— 哪怕完全离线也能瞬间打开，
// 配合 localStorage 里的任务缓存，进去就是首页。
//
// 更新策略是 stale-while-revalidate：先给缓存里的，同时后台悄悄拉新的，
// 下次打开就是新版。代价是改动会晚一次生效，换来的是永远不用等。
//
// 发新版时把 VERSION 加一，旧缓存会在 activate 里被清掉。
// ══════════════════════════════════════════════════════════════════════════

const VERSION = 'v2';
const CACHE = `ddl-shell-${VERSION}`;

const SHELL = [
  './',
  './index.html',
  './css/styles.css',
  './vendor/supabase.js',
  './js/config.js',
  './js/ui.js',
  './js/db.js',
  './js/auth.js',
  './js/render.js',
  './js/tasks.js',
  './js/log.js',
  './js/init.js',
  './manifest.webmanifest',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      // 单个文件失败不该让整次安装失败
      .then(c => Promise.allSettled(SHELL.map(u => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // 只管自己域名下的静态文件。
  // Supabase 是另一个域，所有数据请求原样放行 —— 绝不能缓存。
  if (url.origin !== self.location.origin) return;

  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req, {ignoreSearch: true});

    // 后台更新，不阻塞这次返回
    const fresh = fetch(req).then(res => {
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    }).catch(() => null);

    if (hit) { e.waitUntil(fresh); return hit; }

    // 没缓存就只能等网络；网络也挂了，导航请求退回首页
    const res = await fresh;
    if (res) return res;
    if (req.mode === 'navigate') {
      const shell = await cache.match('./index.html');
      if (shell) return shell;
    }
    return new Response('离线', {status: 503, headers: {'Content-Type': 'text/plain; charset=utf-8'}});
  })());
});
