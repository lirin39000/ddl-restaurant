// ── Supabase ──────────────────────────────────────────────────────────────
const SUPABASE_URL = 'https://dykzgexoohulepmbjimc.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR5a3pnZXhvb2h1bGVwbWJqaW1jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1OTg5MTcsImV4cCI6MjA5MDE3NDkxN30.zeWGEt3PVAgvJVUG_9iQQwYXweZGqscuIUoueSv0AlE';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
let currentUser = null;

// ── Auth ──────────────────────────────────────────────────────────────────
let authMode = 'login';
let sessionLoaded = false;

// ── 外观 ───────────────────────────────────────────────────────────────────
// iOS 的默认是跟随系统，所以 auto 放第一个。
const APPEARANCES = [
  {id:'auto',  name:'自动'},
  {id:'light', name:'浅色'},
  {id:'dark',  name:'深色'},
];
let currentAppearance = localStorage.getItem('ddl-appearance') || 'auto';

// ── 列表 ───────────────────────────────────────────────────────────────────
// catId / hasDate / grey 沿用原值，数据库不动。
// tint 用 iOS 系统色，icon 是 SF Symbols 的近似画法。
const CATS = [
  {id:"daily",  label:"日常",     hasDate:false, grey:true,  tint:"orange", icon:"repeat"},
  {id:"short",  label:"短期",     hasDate:true,  grey:false, tint:"red",    icon:"flame"},
  {id:"long",   label:"长期",     hasDate:true,  grey:false, tint:"green",  icon:"flag"},
  {id:"noddle", label:"无期限",   hasDate:false, grey:false, tint:"blue",   icon:"tray"},
  {id:"watch",  label:"偶尔关注", hasDate:false, grey:true,  tint:"purple", icon:"eye"},
];
const ARCHIVE_CAT = {id:"__done", label:"已完成", tint:"gray", icon:"check"};

// ── 短期 / 长期 是算出来的，不是存死的 ────────────────────────────────────
// 截止日在 7 天内 → 短期，否则 → 长期。
// 所以一条长期任务会随着时间自己走到短期来，不需要手动搬。
// 数据库里仍然存一个 cat_id（原版网站还要读它），
// 但显示一律以 bucketOf() 为准，并在载入时把不一致的写回去。
const SHORT_TERM_DAYS = 7;
const TIMED = ['short', 'long'];

function daysUntil(dateStr) {
  const dt = parseDate(dateStr);
  if (!dt) return null;
  const n = new Date();
  return Math.floor((dt - new Date(n.getFullYear(), n.getMonth(), n.getDate())) / 86400000);
}

function bucketOf(t) {
  if (!TIMED.includes(t.catId)) return t.catId;
  const d = daysUntil(t.date);
  if (d === null) return 'long';            // 没填日期的，先放长期
  return d < SHORT_TERM_DAYS ? 'short' : 'long';
}

const TODAY = (()=>{const d=new Date();return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;})();
const WEEKDAYS = ["周日","周一","周二","周三","周四","周五","周六"];

// ── 优先级 ─────────────────────────────────────────────────────────────────
// 数据库仍存 0–100；提醒事项是用 ! !! !!! 表示的，这里照搬。
const PRIORITIES = [
  {v:0,   label:"无",   bangs:""},
  {v:50,  label:"中",   bangs:"!!"},
  {v:100, label:"高",   bangs:"!!!"},
];
function priorityOf(imp) {
  const n = Number(imp) || 0;
  if (n >= 75) return PRIORITIES[2];
  if (n >= 25) return PRIORITIES[1];
  return PRIORITIES[0];
}

// ── 状态 ───────────────────────────────────────────────────────────────────
let tasks = [];
let activeCat = 'daily';
let showingArchive = false;

let loadingTimer = null;

// ── 滑动删除 ───────────────────────────────────────────────────────────────
const SWIPE_REVEAL = 150;
const SWIPE_COMMIT = 60;

let editingId = null;
