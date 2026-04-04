// ── Supabase ──────────────────────────────────────────────────────────────
const SUPABASE_URL = 'https://dykzgexoohulepmbjimc.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR5a3pnZXhvb2h1bGVwbWJqaW1jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1OTg5MTcsImV4cCI6MjA5MDE3NDkxN30.zeWGEt3PVAgvJVUG_9iQQwYXweZGqscuIUoueSv0AlE';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
let currentUser = null;

// ── Auth state ────────────────────────────────────────────────────────────
let authMode = 'login';
let sessionLoaded = false;

// ── Themes ────────────────────────────────────────────────────────────────
const THEMES = [
  {id:"mcdonalds",name:"麦当劳",tag:"金色 · 经典",emoji:"🍔",dotBg:"#ffbc0d",dotText:"#1a1a1a",logo:"🍔",tagline:"今日任务，一网打尽",badge:"🟢 营业中"},
  {id:"kfc",name:"肯德基",tag:"红色 · 热辣",emoji:"🍗",dotBg:"#e8001c",dotText:"#fff",logo:"🍗",tagline:"好任务，到家了",badge:"🔴 随时取餐"},
  {id:"walmart",name:"沃尔玛",tag:"蓝色 · 实惠",emoji:"🛒",dotBg:"#0071ce",dotText:"#fff",logo:"🛒",tagline:"省钱省力，任务到家",badge:"🔵 全天营业"},
  {id:"starbucks",name:"星巴克",tag:"绿色 · 精品",emoji:"☕",dotBg:"#00704a",dotText:"#fff",logo:"☕",tagline:"用心完成，每一天",badge:"🟢 今日特调"},
];
let currentTheme = localStorage.getItem("ddl-theme") || "mcdonalds";

// ── Categories & constants ─────────────────────────────────────────────────
const CATS = [
  {id:"daily", label:"日常",    emoji:"🍟",hasDate:false,grey:true, bgColor:"#fff3cd",darkBgColor:"#b87800",foods:["🍟","🥚","🥞","☕","🧇"],descs:["每天都要来一份的经典款","日常必备，缺它不行","每日限定，先到先得"]},
  {id:"short", label:"短期",    emoji:"🍔",hasDate:true, grey:false,bgColor:"#ffe0e0",darkBgColor:"#cc1400",foods:["🍔","🌯","🥙","🫔","🥪"],descs:["限时特供，过期不候","截止前请务必取餐","倒计时特惠，手慢无"]},
  {id:"long",  label:"长期",    emoji:"🌮",hasDate:true, grey:false,bgColor:"#e0f5e0",darkBgColor:"#1a6e1a",foods:["🌮","🥗","🍱","🫕","🥘"],descs:["慢工出细活，值得等待","长期精品，细细品味","时间越久越香"]},
  {id:"noddle",label:"无DDL",  emoji:"🥤",hasDate:false,grey:false,bgColor:"#e0eaff",darkBgColor:"#1a3bcc",foods:["🥤","🧋","🍹","🥛","🍵"],descs:["随时可取，无限期供应","不急，慢慢来","佛系任务，随缘完成"]},
  {id:"watch", label:"偶尔关注",emoji:"🍦",hasDate:false,grey:true, bgColor:"#f3e0ff",darkBgColor:"#7700cc",foods:["🍦","🧁","🍰","🍩","🍪"],descs:["偶尔补货，随时关注","不定期上新，保持关注","惊喜随时可能出现"]},
];
const TODAY = (()=>{const d=new Date();return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;})();
const WEEKDAYS = ["周日","周一","周二","周三","周四","周五","周六"];
const MOTTOS = ["祝您生活愉快～欢迎下次光临","每一条划掉的任务\n都是今天最好的勋章","今天的你，超级棒！\n明日份菜单已在路上","完成任务，心情大好\n明天继续加油","您已清空今日菜单\n厨师为您骄傲 👨‍🍳"];

// ── App state ─────────────────────────────────────────────────────────────
let tasks = [];
let completedOpen = false;
let scrollingProg = false;

// ── Loading ───────────────────────────────────────────────────────────────
const LOADING_TIPS = [
  "🍳 厨师正在备餐，请稍候…",
  "🥬 今日食材新鲜到货…",
  "🔥 后厨正在热锅…",
  "📋 正在核对今日菜单…",
  "🛵 外卖小哥已待命…",
  "⭐ 为您准备今日特供…",
  "🧑‍🍳 主厨正在施展厨艺…",
  "🍱 便当已打包完毕…",
];
const FOOD_EMOJIS = ["🍔","🍟","🌮","🥤","🍦","🧁","🥗","🍱","☕","🥞","🍕","🥙"];
let loadingTimer = null;

// ── Swipe ─────────────────────────────────────────────────────────────────
const SWIPE_REVEAL = 144;
const SWIPE_COMMIT = 60;

// ── Edit ──────────────────────────────────────────────────────────────────
let editingId = null;
