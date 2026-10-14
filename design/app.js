/* Wordma — 桌面写作工具原型
   多站点数据层 + hash 路由 + 页面渲染 + 编辑器流程。
   数据保存在内存中，刷新后回到演示数据。 */
'use strict';

/* ================= 数据 ================= */

let _seq = 100;
const uid = (p) => p + '_' + (_seq++);

function mkArticle(o) {
  return Object.assign({
    id: uid('a'), title: '', content: '', tags: [], category: null,
    status: 'draft', date: '2026-09-01', updated: '2026-09-01', words: 0,
  }, o);
}

function mkSite(o) {
  return Object.assign({
    id: uid('s'), name: '', desc: '', hue: 'a', theme: 'mobai',
    articles: [], tags: [], categories: [],
    settings: { author: '', lang: 'zh-CN', platform: 'GitHub Pages', repo: '', branch: 'main', domain: '' },
  }, o);
}

const INITIAL_SITES = [
  mkSite({
    name: '远山笔记', desc: '徒步、露营与摄影的记录', hue: 'a',
    categories: [
      { id: 'c1', name: '户外' }, { id: 'c2', name: '摄影' }, { id: 'c3', name: '日常' },
    ],
    tags: [
      { id: 't1', name: '徒步' }, { id: 't2', name: '露营' }, { id: 't3', name: '装备' },
      { id: 't4', name: '摄影' }, { id: 't5', name: '城市漫游' },
    ],
    articles: [
      mkArticle({
        id: 'p1', title: '雨崩村徒步纪行', status: 'published', date: '2026-09-21', updated: '2026-09-22', words: 1860,
        category: 'c1', tags: ['t1', 't3'],
        content: '雨崩村藏在梅里雪山脚下，进村没有公路，只有一条徒步道。从西当温泉出发，上坡十二公里，翻过垭口的时候，雾恰好散开，卡瓦格博的侧脊露了出来。\n\n## 路线\n\n- 西当温泉进，尼农大峡谷出\n- 第一晚住上雨崩，第二天往返冰湖\n- 全程负重约九公斤，走了两天\n\n## 几点体会\n\n> 高原徒步最重要的是节奏，不是速度。喘不上气的时候就停下来，看一会儿山。\n\n装备方面这次做了减法，睡袋换成 700 蓬的，省了将近一公斤重量。详细的清单回头单独整理一篇。\n\n下山的路上一直在想，所谓的「远方」，其实只是把日常的噪音关掉的那几天。',
      }),
      mkArticle({
        id: 'p2', title: '武功山云海露营指南', status: 'published', date: '2026-08-30', updated: '2026-09-02', words: 1420,
        category: 'c1', tags: ['t2', 't3'],
        content: '武功山的精华在高山草甸，六月到十月都适合上去。这篇整理一下两次露营之后觉得靠谱的走法。\n\n## 行程\n\n- Day 1：龙山村上山，宿发云界，看日落\n- Day 2：发云界到金顶，约七小时，索道下山\n\n## 注意事项\n\n> 山顶风大，帐篷一定要选三季以上的抗风款，地钉打满。\n\n云海多出现在雨后初晴的清晨，所以别怕天气预报里的雨，那反而是好消息。运气好的话，夜里还能看到银河。',
      }),
      mkArticle({
        id: 'p3', title: '装备清单：轻量化徒步的取舍', status: 'published', date: '2026-07-14', updated: '2026-07-16', words: 980,
        category: 'c1', tags: ['t3', 't1'],
        content: '轻量化不是花钱买最轻的东西，而是想清楚每件东西「不带会怎样」。\n\n## 我砍掉的\n\n- 炉头换成了冷萃咖啡包，省 300 克\n- 两件外套合成一件皮肤风衣\n- 三脚架：用石头垫手机代替\n\n## 我加回去的\n\n> 有一年为了轻没带备用袜子，后两天全程靠意志走路。有些重量是幸福税，值得交。\n\n现在基重 6.8 公斤，对一个业余爱好者来说够用了。',
      }),
      mkArticle({
        id: 'p4', title: '城市夜骑：环四环六十公里', status: 'published', date: '2026-06-08', updated: '2026-06-10', words: 760,
        category: 'c3', tags: ['t5'],
        content: '晚上十点出发，沿着四环辅路骑了一整圈。城市的夜晚和白天是两个地方：桥下的排档、代驾师傅的小折叠车、凌晨还亮着的便利店。\n\n补给放在背包里的是两根能量胶和一瓶电解质水，六个小时骑完，回来腿疼了三天，但值。',
      }),
      mkArticle({
        id: 'p5', title: '秋季川西摄影路线整理', status: 'draft', date: '2026-09-28', updated: '2026-09-30', words: 640,
        category: 'c2', tags: ['t4'],
        content: '十月中下旬是新都桥和甲根坝最好的时候，白杨树全黄，雪山还没封山。\n\n## 计划点位\n\n- 新都桥：晨雾中的藏寨与杨林\n- 甲根坝：傍晚的钙化滩\n- 子梅垭口：看贡嘎日落金山\n\n还没想好是自驾还是包车，先把点位资料放这里，回头发完整攻略。',
      }),
      mkArticle({
        id: 'p6', title: '十月看星计划', status: 'draft', date: '2026-10-02', updated: '2026-10-03', words: 410,
        category: 'c3', tags: ['t2', 't4'],
        content: '十月的月光干扰少，是看银河的好窗口。初步想法是找一个光污染三级以下的营地，带赤道仪拍两个晚上。\n\n目标目标：仙女座星系 M31，还有秋季的 双星团。先记一笔，具体等天气预报。',
      }),
    ],
    settings: {
      author: '阿远', lang: 'zh-CN', platform: 'GitHub Pages',
      repo: 'yuanshan/notes', branch: 'main', domain: 'blog.yuanshan.cc',
    },
  }),
  mkSite({
    name: '产品手记', desc: '关于产品、设计与独立开发的思考', hue: 'b',
    categories: [
      { id: 'd1', name: '产品思考' }, { id: 'd2', name: '设计笔记' },
    ],
    tags: [
      { id: 'u1', name: '产品' }, { id: 'u2', name: '设计' }, { id: 'u3', name: 'AI' }, { id: 'u4', name: '独立开发' },
    ],
    articles: [
      mkArticle({
        id: 'q1', title: '写作工具的减法哲学', status: 'published', date: '2026-09-15', updated: '2026-09-18', words: 1240,
        category: 'd1', tags: ['u1', 'u2'],
        content: '打开大多数写作软件，第一眼看到的是工具栏：加粗、斜体、对齐、字体、颜色……然后你会忘记本来要写什么。\n\n## 少即是快\n\n写作工具的职责只有一个：让想法尽快落成文字。其余一切——排版、发布、管理——都应该发生在写完之后。\n\n> 工具存在的意义，是在你想要它的时候出现，在你不需要的时候消失。\n\n所以我们在设计上做了一个激进的决定：没有工具栏，没有侧边设置面板，只有标题和正文。',
      }),
      mkArticle({
        id: 'q2', title: '本地优先软件的幸福感', status: 'published', date: '2026-08-11', updated: '2026-08-13', words: 1080,
        category: 'd2', tags: ['u2', 'u4'],
        content: '云服务给你的是「随时访问」，本地文件给你的是「永远拥有」。这两件事的差别，要在服务停运那一天才能体会。\n\n## 本地优先的三种底气\n\n- 数据是自己的：纯文本、开放格式，任何编辑器都能打开\n- 断网可用：飞机上、地下室里照写不误\n- 速度快：打开就是全部状态，不用等加载\n\n我不反对云同步，但同步应该是副本，而不是原件。',
      }),
      mkArticle({
        id: 'q3', title: '从 0 到 1 做一个静态博客工具', status: 'published', date: '2026-07-02', updated: '2026-07-05', words: 1560,
        category: 'd1', tags: ['u4', 'u1'],
        content: '为什么在 2026 年还要做一个静态博客客户端？因为写博客这件事，被越来越多的步骤包围了：建仓库、配 CI、写配置、学模板语法。\n\n## 我们的答案\n\n把流程压回三步：写、点发布、看到上线。技术栈藏在最后面，写作的人不需要知道 Git 是什么。\n\n## 踩过的坑\n\n- 首屏想做太多，反而三个月没法发布\n- 模板系统过度设计，后来砍掉一半功能\n- 用户要的从来不是「强大」，是「顺手」\n\n下一篇文章写多站点架构的取舍。',
      }),
      mkArticle({
        id: 'q4', title: 'AI 时代的个人知识库', status: 'draft', date: '2026-09-29', updated: '2026-10-01', words: 520,
        category: 'd1', tags: ['u3', 'u1'],
        content: 'AI 能帮你检索、摘要、联想，但替代不了「写入」这个动作。知识库的价值不在于存了多少，而在于你写下来的时候想清楚了多少。\n\n所以未来的个人知识库可能是：人负责写，AI 负责整理和提问。\n\n这一篇还只是个提纲，慢慢补。',
      }),
    ],
    settings: {
      author: '阿远', lang: 'zh-CN', platform: 'GitHub Pages',
      repo: 'yuanshan/product-notes', branch: 'main', domain: '',
    },
  }),
];

let db = null;
const state = {
  siteId: null,
  query: { q: '', status: 'all' },
  fromEditor: false,
  articlesScroll: 0,
  lastSavedAt: null,
};

function site() {
  return db.sites.find((s) => s.id === state.siteId) || db.sites[0];
}
function tagById(id) { const t = site().tags.find((x) => x.id === id); return t ? t.name : ''; }
function catById(id) { const c = site().categories.find((x) => x.id === id); return c ? c.name : ''; }
function countWords(raw) { return raw.replace(/\s/g, '').length; }
function fmtDate(s) { return s; }

/* ================= 基础设施 ================= */

const $view = document.getElementById('view');
const $overlay = document.getElementById('overlay-root');

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

const I = {
  dashboard: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5"/></svg>',
  article: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8.5 13h7"/><path d="M8.5 17h4.5"/></svg>',
  tag: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12.6 2.9 21 11.3a2 2 0 0 1 0 2.8l-6.9 6.9a2 2 0 0 1-2.8 0L2.9 12.6A2 2 0 0 1 2.3 11.2V4.3a2 2 0 0 1 2-2h6.9a2 2 0 0 1 1.4.6z"/><circle cx="7.8" cy="7.8" r="1.3"/></svg>',
  folder: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.7-.9L9.2 3.9A2 2 0 0 0 7.5 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2z"/></svg>',
  palette: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21a9 9 0 1 1 9-9c0 2.5-2 3.5-3.5 3.5H15a2 2 0 0 0-1.5 3.3c.3.4.5.8.5 1.2a2 2 0 0 1-2 2z"/><circle cx="7.8" cy="10.5" r="1.1"/><circle cx="12" cy="7.5" r="1.1"/><circle cx="16.2" cy="10.5" r="1.1"/></svg>',
  settings: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 21v-7"/><path d="M4 10V3"/><path d="M12 21v-9"/><path d="M12 8V3"/><path d="M20 21v-5"/><path d="M20 12V3"/><path d="M1.5 14h5"/><path d="M9.5 8h5"/><path d="M17.5 16h5"/></svg>',
  plus: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg>',
  search: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.2-3.2"/></svg>',
  chevD: '<svg class="chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>',
  back: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>',
  check: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
  checkSm: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
  trash: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>',
  pen: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>',
  eye: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>',
  send: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>',
  save: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8"/><path d="M7 3v5h8"/></svg>',
  inbox: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.4 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.4-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.8 1.1z"/></svg>',
  folderBig: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.7-.9L9.2 3.9A2 2 0 0 0 7.5 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2z"/></svg>',
  globe: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a13.5 13.5 0 0 1 0 18 13.5 13.5 0 0 1 0-18z"/></svg>',
  err: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>',
};

function toast(msg, type) {
  let wrap = document.querySelector('.toast-wrap');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.className = 'toast-wrap';
    document.body.appendChild(wrap);
  }
  const t = document.createElement('div');
  t.className = 'toast ' + (type === 'err' ? 'err' : 'ok');
  t.setAttribute('role', 'status');
  t.innerHTML = (type === 'err' ? I.err : I.check) + '<span></span>';
  t.lastElementChild.textContent = msg;
  wrap.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity 200ms'; }, 2000);
  setTimeout(() => t.remove(), 2300);
}

let $scrim = null;
function closeModal() { if ($scrim) { $scrim.remove(); $scrim = null; } }
function openModal(html) {
  closeModal();
  $scrim = document.createElement('div');
  $scrim.className = 'scrim';
  $scrim.innerHTML = '<div class="dialog" role="dialog" aria-modal="true">' + html + '</div>';
  $scrim.addEventListener('click', (e) => { if (e.target === $scrim) closeModal(); });
  $overlay.appendChild($scrim);
  const f = $scrim.querySelector('input, button');
  if (f) f.focus();
  return $scrim;
}
function confirmModal(o) {
  const m = openModal(
    '<h3></h3><p class="dlg-msg"></p>' +
    '<div class="dlg-actions">' +
    '<button class="btn btn-ghost" data-x="no">取消</button>' +
    '<button class="btn ' + (o.danger ? 'btn-danger' : 'btn-primary') + '" data-x="yes"></button>' +
    '</div>'
  );
  m.querySelector('h3').textContent = o.title;
  m.querySelector('.dlg-msg').innerHTML = o.html || esc(o.message || '');
  m.querySelector('[data-x="yes"]').textContent = o.confirmText || '确认';
  m.querySelector('[data-x="no"]').onclick = closeModal;
  m.querySelector('[data-x="yes"]').onclick = () => { closeModal(); o.onConfirm(); };
}

let $drop = null;
function closeDrop() { if ($drop) { $drop.remove(); $drop = null; } }
function openDropdown(anchor, html, onMount) {
  if ($drop) { $drop.remove(); $drop = null; return; }
  $drop = document.createElement('div');
  $drop.className = 'dropdown';
  $drop.innerHTML = html;
  $overlay.appendChild($drop);
  const r = anchor.getBoundingClientRect();
  const w = Math.max(220, Math.min(300, r.width));
  $drop.style.minWidth = w + 'px';
  let top = r.bottom + 6;
  const h = $drop.offsetHeight;
  if (top + h > innerHeight - 12) top = Math.max(12, r.top - h - 6);
  let left = Math.min(r.left, innerWidth - w - 12);
  $drop.style.top = top + 'px';
  $drop.style.left = Math.max(12, left) + 'px';
  anchor.setAttribute('aria-expanded', 'true');
  $drop._anchor = anchor;
  if (onMount) onMount($drop);
  return $drop;
}
document.addEventListener('pointerdown', (e) => {
  if ($drop && !$drop.contains(e.target) && (!$drop._anchor || !$drop._anchor.contains(e.target))) closeDrop();
});

/* ================= 路由 ================= */

const ROUTES = [
  { name: 'dashboard', label: '仪表盘', icon: I.dashboard },
  { name: 'articles', label: '文章', icon: I.article },
  { name: 'tags', label: '标签', icon: I.tag },
  { name: 'categories', label: '分类', icon: I.folder },
  { name: 'themes', label: '主题', icon: I.palette },
  { name: 'settings', label: '设置', icon: I.settings },
];

function parseHash() {
  const h = location.hash.replace(/^#\/?/, '');
  const parts = h.split('/');
  const name = parts[0] || 'dashboard';
  if (name === 'editor') return { name: 'editor', param: parts[1] || 'new' };
  if (ROUTES.some((r) => r.name === name)) return { name, param: null };
  return { name: 'dashboard', param: null };
}
function go(path) { location.hash = '#/' + path; }

function renderSidebar() {
  const s = site();
  const r = parseHash();
  const sw = document.getElementById('site-switcher');
  sw.innerHTML =
    '<button class="switcher-btn" id="sw-btn" aria-haspopup="listbox" aria-expanded="false">' +
    '<span class="avatar' + (s.hue !== 'a' ? ' hue-' + s.hue : '') + '">' + esc(s.name.slice(0, 1)) + '</span>' +
    '<span class="switcher-name"><span class="nm"></span><span class="ct">' + s.articles.length + ' 篇文章</span></span>' +
    I.chevD + '</button>';
  sw.querySelector('.nm').textContent = s.name;
  sw.querySelector('#sw-btn').onclick = () => {
    if ($drop) { closeDrop(); return; }
    const html = db.sites.map((it) =>
      '<button class="drop-item" data-site="' + it.id + '">' +
      '<span class="avatar' + (it.hue !== 'a' ? ' hue-' + it.hue : '') + '" style="width:24px;height:24px;font-size:12px;border-radius:6px">' + esc(it.name.slice(0, 1)) + '</span>' +
      '<span class="di-main"><span class="di-nm"></span><span class="di-ct">' + it.articles.length + ' 篇文章</span></span>' +
      '<span class="di-check">' + (it.id === s.id ? I.checkSm : '') + '</span></button>'
    ).join('') +
      '<div class="drop-divider"></div>' +
      '<button class="drop-item" data-newsite="1"><span class="di-check">' + I.plus + '</span><span class="di-main"><span class="di-nm">新建站点</span><span class="di-ct">独立的内容空间</span></span></button>';
    const d = openDropdown(sw.querySelector('#sw-btn'), html);
    d.querySelectorAll('[data-site]').forEach((b) => {
      b.querySelector('.di-nm').textContent = db.sites.find((x) => x.id === b.dataset.site).name;
      b.onclick = () => { switchSite(b.dataset.site); };
    });
    d.querySelector('[data-newsite]').onclick = () => { closeDrop(); newSiteModal(); };
  };

  const nav = document.getElementById('nav');
  nav.innerHTML = ROUTES.map((rt) => {
    let count = '';
    if (rt.name === 'articles') count = '<span class="nav-count">' + s.articles.length + '</span>';
    if (rt.name === 'tags') count = '<span class="nav-count">' + s.tags.length + '</span>';
    if (rt.name === 'categories') count = '<span class="nav-count">' + s.categories.length + '</span>';
    const active = r.name === rt.name || (r.name === 'editor' && rt.name === 'articles');
    return '<button class="nav-item' + (active ? ' active' : '') + '" data-route="' + rt.name + '" aria-current="' + (active ? 'page' : 'false') + '">' +
      rt.icon + '<span class="nav-label">' + rt.label + '</span>' + count + '</button>';
  }).join('');
  nav.querySelectorAll('[data-route]').forEach((b) => { b.onclick = () => go(b.dataset.route); });
}

function switchSite(id) {
  closeDrop(); closeModal();
  state.siteId = id;
  state.query = { q: '', status: 'all' };
  go('dashboard');
  render();
}

function render() {
  const r = parseHash();
  if (r.name !== 'editor') editing = null;
  pruneEmpty();
  renderSidebar();
  closeDrop();
  if (r.name === 'dashboard') viewDashboard();
  else if (r.name === 'articles') viewArticles();
  else if (r.name === 'editor') viewEditor(r.param);
  else if (r.name === 'tags') viewTags();
  else if (r.name === 'categories') viewCategories();
  else if (r.name === 'themes') viewThemes();
  else if (r.name === 'settings') viewSettings();
}

/* ================= 仪表盘 ================= */

function greeting() {
  const h = new Date().getHours();
  if (h < 6) return '夜深了';
  if (h < 12) return '早上好';
  if (h < 18) return '下午好';
  return '晚上好';
}

function viewDashboard() {
  const s = site();
  const published = s.articles.filter((a) => a.status === 'published').length;
  const drafts = s.articles.length - published;
  const words = s.articles.reduce((n, a) => n + a.words, 0);
  const recent = s.articles.slice().sort((a, b) => (b.updated > a.updated ? 1 : -1)).slice(0, 5);

  const stats =
    '<div class="stat-grid">' +
    statCard(s.articles.length, '文章总数') +
    statCard(published, '已发布') +
    statCard(drafts, '草稿箱') +
    statCard(words.toLocaleString('zh-CN'), '总字数') +
    '</div>';

  const list = recent.length
    ? '<div class="card"><div class="card-head"><span class="t">最近编辑</span></div><div class="rowlist">' +
      recent.map((a) => articleRow(a, false)).join('') + '</div></div>'
    : emptyState(I.inbox, '还没有文章', '写下第一篇，从这个站点开始积累。', '<button class="btn btn-primary" data-new="1">' + I.plus + '写一篇文章</button>');

  $view.className = 'view';
  $view.innerHTML =
    '<div class="hello od-row-top" style="--od-gap:0">' +
    '<div class="od-fill"><h1>' + greeting() + '，' + esc(site().settings.author || '写作者') + '</h1>' +
    '<p>「' + esc(s.name) + '」' + (s.articles.length ? '一切井然有序，继续写吧。' : '还是一片空白，从第一篇开始。') + '</p></div>' +
    '<button class="btn btn-primary od-fixed" data-new="1">' + I.plus + '写一篇文章</button></div>' +
    stats + list;
  $view.querySelectorAll('[data-new]').forEach((b) => { b.onclick = () => go('editor/new'); });
  bindArticleRows($view);
}

function statCard(num, cap) {
  return '<div class="stat-card od-stat"><span class="num">' + num + '</span><span class="cap">' + cap + '</span></div>';
}

function emptyState(icon, title, desc, actionHtml) {
  return '<div class="empty"><div class="e-icon">' + icon + '</div><h3>' + title + '</h3><p>' + desc + '</p>' + (actionHtml || '') + '</div>';
}

/* ================= 文章 ================= */

function statusChip(a) {
  return a.status === 'published'
    ? '<span class="chip chip-pub">已发布</span>'
    : '<span class="chip chip-draft">草稿</span>';
}

function articleMeta(a) {
  const bits = [];
  if (a.category) bits.push(catById(a.category));
  const tags = a.tags.map(tagById).filter(Boolean);
  if (tags.length) bits.push(tags.join(' · '));
  bits.push(fmtDate(a.date));
  bits.push('约 ' + a.words.toLocaleString('zh-CN') + ' 字');
  return bits.join(' · ');
}

function articleRow(a, withActions) {
  return '<div class="rowitem" data-open="' + a.id + '" role="button" tabindex="0">' +
    '<span class="ri-main"><span class="ri-title od-keep">' + esc(a.title || '（无标题）') + '</span>' +
    '<span class="ri-meta od-truncate">' + esc(articleMeta(a)) + '</span></span>' +
    '<span class="ri-side">' + statusChip(a) +
    (withActions
      ? '<button class="icon-btn" data-edit="' + a.id + '" aria-label="编辑「' + esc(a.title) + '」">' + I.pen + '</button>' +
        '<button class="icon-btn danger" data-del="' + a.id + '" aria-label="删除「' + esc(a.title) + '」">' + I.trash + '</button>'
      : '') +
    '</span></div>';
}

function bindArticleRows(root) {
  root.querySelectorAll('[data-open]').forEach((row) => {
    const open = () => {
      state.articlesScroll = $view.scrollTop;
      state.fromEditor = true;
      go('editor/' + row.dataset.open);
    };
    row.onclick = (e) => { if (!e.target.closest('button')) open(); };
    row.onkeydown = (e) => { if (e.key === 'Enter' && !e.target.closest('button')) open(); };
  });
  root.querySelectorAll('[data-edit]').forEach((b) => {
    b.onclick = (e) => { e.stopPropagation(); go('editor/' + b.dataset.edit); };
  });
  root.querySelectorAll('[data-del]').forEach((b) => {
    b.onclick = (e) => { e.stopPropagation(); deleteArticle(b.dataset.del); };
  });
}

function viewArticles() {
  const s = site();
  const q = state.query;
  let list = s.articles.slice().sort((a, b) => (b.updated > a.updated ? 1 : -1));
  if (q.status !== 'all') list = list.filter((a) => a.status === q.status);
  if (q.q) {
    const k = q.q.toLowerCase();
    list = list.filter((a) =>
      a.title.toLowerCase().includes(k) ||
      a.tags.map(tagById).some((t) => t.toLowerCase().includes(k)) ||
      (a.category && catById(a.category).toLowerCase().includes(k)));
  }

  const seg = ['all', 'published', 'draft'].map((k) => {
    const label = k === 'all' ? '全部' : k === 'published' ? '已发布' : '草稿';
    return '<button data-f="' + k + '"' + (q.status === k ? ' class="on"' : '') + '>' + label + '</button>';
  }).join('');

  const body = list.length
    ? '<div class="card"><div class="rowlist">' + list.map((a) => articleRow(a, true)).join('') + '</div></div>'
    : (s.articles.length === 0
      ? emptyState(I.inbox, '还没有文章', '第一篇文章往往最难，也最重要。', '<button class="btn btn-primary" data-new="1">' + I.plus + '写一篇文章</button>')
      : emptyState(I.search, '没有匹配的文章', '换个关键词，或清除筛选条件试试。', ''));

  $view.className = 'view';
  $view.scrollTop = state.fromEditor ? state.articlesScroll : 0;
  state.fromEditor = false;
  $view.innerHTML =
    '<div class="page-head od-row">' +
    '<div class="od-fill"><div class="ph-title">文章</div><div class="ph-sub">共 ' + s.articles.length + ' 篇 · ' + site().name + '</div></div>' +
    '<button class="btn btn-primary od-fixed" data-new="1">' + I.plus + '新建文章</button></div>' +
    '<div class="page-head od-row" style="margin-bottom:14px">' +
    '<div class="segmented od-fixed" aria-label="状态筛选">' + seg + '</div>' +
    '<div class="od-fill"></div>' +
    '<div class="od-fixed" style="position:relative;width:220px;max-width:44%">' +
    '<input class="input" id="q-input" type="search" placeholder="搜索标题、标签或分类…" aria-label="搜索文章" value="' + esc(q.q) + '"></div></div>' +
    body;

  $view.querySelectorAll('[data-new]').forEach((b) => { b.onclick = () => go('editor/new'); });
  $view.querySelectorAll('[data-f]').forEach((b) => {
    b.onclick = () => { state.query.status = b.dataset.f; viewArticles(); renderSidebar(); };
  });
  const qi = $view.querySelector('#q-input');
  qi.oninput = () => { state.query.q = qi.value.trim(); viewArticles(); const n = $view.querySelector('#q-input'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); };
  bindArticleRows($view);
}

function deleteArticle(id) {
  const a = site().articles.find((x) => x.id === id);
  if (!a) return;
  confirmModal({
    title: '删除文章',
    message: '「' + (a.title || '（无标题）') + '」将被永久删除，此操作无法撤销。',
    confirmText: '删除',
    danger: true,
    onConfirm: () => {
      const s = site();
      s.articles = s.articles.filter((x) => x.id !== id);
      toast('文章已删除');
      render();
    },
  });
}

/* ================= Markdown 轻量渲染 ================= */

function inline(s) {
  return s
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
}

function md(raw) {
  const lines = esc(raw).split('\n');
  const out = [];
  let para = [], quote = [], list = null;
  const flushP = () => { if (para.length) { out.push('<p>' + inline(para.join('<br>')) + '</p>'); para = []; } };
  const flushQ = () => { if (quote.length) { out.push('<blockquote><p>' + inline(quote.join('<br>')) + '</p></blockquote>'); quote = []; } };
  const flushL = () => { if (list) { out.push('<' + list + '>' + listBuf.map((x) => '<li>' + inline(x) + '</li>').join('') + '</' + list + '>'); list = null; listBuf = []; } };
  let listBuf = [];
  const flushAll = () => { flushP(); flushQ(); flushL(); };
  for (const ln of lines) {
    const t = ln.trim();
    if (/^###\s/.test(t)) { flushAll(); out.push('<h3>' + inline(t.slice(4)) + '</h3>'); }
    else if (/^##\s/.test(t)) { flushAll(); out.push('<h2>' + inline(t.slice(3)) + '</h2>'); }
    else if (/^---+$/.test(t)) { flushAll(); out.push('<hr>'); }
    else if (/^&gt;\s?/.test(t)) { flushP(); flushL(); quote.push(t.replace(/^&gt;\s?/, '')); }
    else if (/^-\s/.test(t)) { flushP(); flushQ(); if (list !== 'ul') flushL(); list = 'ul'; listBuf.push(t.slice(2)); }
    else if (/^\d+\.\s/.test(t)) { flushP(); flushQ(); if (list !== 'ol') flushL(); list = 'ol'; listBuf.push(t.replace(/^\d+\.\s/, '')); }
    else if (t === '') { flushAll(); }
    else { flushQ(); flushL(); para.push(t); }
  }
  flushAll();
  return out.join('\n');
}

/* ================= 编辑器 ================= */

let editing = null; // 当前编辑中的文章引用

function viewEditor(id) {
  const s = site();
  let a;
  if (id === 'new') {
    a = mkArticle({ title: '', status: 'draft', words: 0, date: today(), updated: today() });
    s.articles.unshift(a);
    editing = a;
    renderSidebarLight();
    try { history.replaceState(null, '', '#/editor/' + a.id); } catch (e) { /* file:// 下个别浏览器限制，保持当前地址即可 */ }
  } else {
    a = s.articles.find((x) => x.id === id);
    if (!a) { go('articles'); return; }
    editing = a;
  }

  $view.className = 'view nopad';
  $view.scrollTop = 0;
  $view.innerHTML =
    '<div class="editor">' +
    '<div class="editor-top od-row">' +
    '<button class="back" id="ed-back">' + I.back + '返回列表</button>' +
    '<span class="save-hint od-fixed" id="save-hint">' + (a.status === 'published' ? '已发布 · ' : '草稿 · ') + fmtDate(a.updated) + '</span>' +
    '<span class="od-fill"></span>' +
    '<button class="btn btn-ghost btn-sm od-fixed" id="ed-draft">' + I.save + '存为草稿</button>' +
    '<button class="btn btn-primary btn-sm od-fixed" id="ed-pub">' + I.send + (a.status === 'published' ? '更新发布' : '发布') + '</button>' +
    '</div>' +
    '<div class="editor-body"><div class="editor-col">' +
    '<input class="title-input" id="ed-title" placeholder="标题…" value="' + esc(a.title) + '" aria-label="文章标题">' +
    '<span class="field-err" id="title-err" hidden>发布前需要先写一个标题</span>' +
    '<div class="editor-meta">' +
    '<button class="meta-btn" id="ed-cat" aria-haspopup="listbox">' + I.folder + '<span id="ed-cat-label"></span>' + I.chevD + '</button>' +
    '<button class="meta-btn" id="ed-tags" aria-haspopup="listbox">' + I.tag + '<span id="ed-tags-label"></span>' + I.chevD + '</button>' +
    '<span class="word-count" id="ed-count"></span>' +
    '</div>' +
    '<div id="ed-pane" class="od-fill" style="display:flex;flex-direction:column;min-height:0">' +
    '<textarea class="content-input" id="ed-body" placeholder="正文支持 Markdown：## 小标题、- 列表、&gt; 引用、**加粗**…" aria-label="文章正文"></textarea>' +
    '</div>' +
    '</div></div></div>';

  const $title = $view.querySelector('#ed-title');
  const $body = $view.querySelector('#ed-body');
  const $count = $view.querySelector('#ed-count');
  const $pane = $view.querySelector('#ed-pane');
  let previewing = false;

  const catBtn = $view.querySelector('#ed-cat');
  const catLabel = $view.querySelector('#ed-cat-label');
  const tagsBtn = $view.querySelector('#ed-tags');
  const tagsLabel = $view.querySelector('#ed-tags-label');

  function syncMeta() {
    catLabel.textContent = a.category ? catById(a.category) : '选择分类';
    catBtn.classList.toggle('has', !!a.category);
    const names = a.tags.map(tagById).filter(Boolean);
    tagsLabel.textContent = names.length ? names.join('、') : '添加标签';
    tagsBtn.classList.toggle('has', names.length > 0);
    if (names.length > 2) tagsLabel.textContent = names.slice(0, 2).join('、') + ' +' + (names.length - 2);
  }
  function syncCount() {
    a.words = countWords($body.value);
    a.updated = today();
    $count.textContent = '约 ' + a.words.toLocaleString('zh-CN') + ' 字';
  }
  syncMeta();
  $title.value = a.title;
  $body.value = a.content;
  syncCount();
  autoGrow();

  $title.oninput = () => { a.title = $title.value; a.updated = today(); };
  function autoGrow() {
    $body.style.height = 'auto';
    $body.style.height = Math.max(420, $body.scrollHeight) + 'px';
  }
  $body.oninput = () => { syncCount(); autoGrow(); a.content = $body.value; };

  // 预览切换：点击字数左侧空白处不可发现 → 用双击 pane 标题? 改为 meta 区加预览按钮
  const prevBtn = document.createElement('button');
  prevBtn.className = 'meta-btn';
  prevBtn.id = 'ed-prev';
  prevBtn.innerHTML = I.eye + '<span>预览</span>';
  prevBtn.setAttribute('aria-pressed', 'false');
  $count.parentNode.insertBefore(prevBtn, $count);

  prevBtn.onclick = () => {
    previewing = !previewing;
    prevBtn.setAttribute('aria-pressed', String(previewing));
    prevBtn.classList.toggle('has', previewing);
    prevBtn.querySelector('span').textContent = previewing ? '编辑' : '预览';
    if (previewing) {
      $body.style.display = 'none';
      const p = document.createElement('div');
      p.id = 'ed-md';
      p.className = 'md';
      p.innerHTML = md($body.value) || '<p style="color:#9AA1AC">（暂无内容）</p>';
      $pane.appendChild(p);
    } else {
      const p = $view.querySelector('#ed-md');
      if (p) p.remove();
      $body.style.display = '';
      autoGrow();
      $body.focus();
    }
  };

  catBtn.onclick = () => {
    if (previewing) return;
    if ($drop) { closeDrop(); return; }
    const items = s.categories.map((c) =>
      '<button class="drop-item" data-cat="' + c.id + '"><span class="di-main"><span class="di-nm">' + esc(c.name) + '</span></span>' +
      '<span class="di-check">' + (a.category === c.id ? I.checkSm : '') + '</span></button>').join('');
    const empty = s.categories.length ? '' : '<div class="drop-item" style="color:var(--muted);cursor:default">还没有分类，去「分类」页创建</div>';
    const clear = a.category ? '<div class="drop-divider"></div><button class="drop-item" data-cat-clear="1">不设分类</button>' : '';
    openDropdown(catBtn, empty + items + clear, (d) => {
      d.querySelectorAll('[data-cat]').forEach((b) => {
        b.onclick = () => { a.category = b.dataset.cat; syncMeta(); closeDrop(); };
      });
      const cc = d.querySelector('[data-cat-clear]');
      if (cc) cc.onclick = () => { a.category = null; syncMeta(); closeDrop(); };
    });
  };

  tagsBtn.onclick = () => {
    if (previewing) return;
    if ($drop) { closeDrop(); return; }
    const items = s.tags.map((t) => {
      const on = a.tags.includes(t.id);
      return '<button class="drop-item" data-tag="' + t.id + '"><span class="di-check">' + (on ? I.checkSm : '') + '</span>' +
        '<span class="di-main"><span class="di-nm">' + esc(t.name) + '</span></span></button>';
    }).join('');
    const empty = s.tags.length ? '' : '<div class="drop-item" style="color:var(--muted);cursor:default">还没有标签</div>';
    openDropdown(tagsBtn, empty + items + '<div class="drop-divider"></div>' +
      '<div class="drop-create"><input class="input" id="tag-new" placeholder="新建标签，回车确认" aria-label="新建标签"><button class="btn btn-ghost btn-sm" id="tag-new-go">添加</button></div>',
      (d) => {
        d.querySelectorAll('[data-tag]').forEach((b) => {
          b.onclick = () => {
            const tid = b.dataset.tag;
            if (a.tags.includes(tid)) a.tags = a.tags.filter((x) => x !== tid);
            else a.tags.push(tid);
            b.querySelector('.di-check').innerHTML = a.tags.includes(tid) ? I.checkSm : '';
            syncMeta();
          };
        });
        const add = () => {
          const inp = d.querySelector('#tag-new');
          const name = inp.value.trim();
          if (!name) return;
          let t = s.tags.find((x) => x.name === name);
          if (!t) { t = { id: uid('t'), name }; s.tags.push(t); }
          if (!a.tags.includes(t.id)) a.tags.push(t.id);
          toast('标签「' + name + '」已添加');
          closeDrop(); syncMeta(); renderSidebar();
        };
        d.querySelector('#tag-new-go').onclick = add;
        d.querySelector('#tag-new').onkeydown = (e) => { if (e.key === 'Enter') add(); };
      });
  };

  function validateTitle() {
    if ($title.value.trim()) { $title.classList.remove('invalid'); $view.querySelector('#title-err').hidden = true; return true; }
    $title.classList.add('invalid');
    $view.querySelector('#title-err').hidden = false;
    $title.focus();
    return false;
  }

  $view.querySelector('#ed-draft').onclick = () => {
    a.title = $title.value.trim();
    a.content = $body.value;
    a.status = 'draft';
    a.updated = today();
    a.words = countWords(a.content);
    state.lastSavedAt = Date.now();
    $view.querySelector('#save-hint').textContent = '草稿已保存 · 刚刚';
    toast('草稿已保存');
  };

  $view.querySelector('#ed-pub').onclick = () => {
    if (!validateTitle()) return;
    a.title = $title.value.trim();
    a.content = $body.value;
    a.status = 'published';
    a.updated = today();
    a.words = countWords(a.content);
    state.fromEditor = true;
    toast(a.status === 'published' ? '已发布到「' + site().name + '」' : '已发布');
    go('articles');
  };

  $title.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); $body.focus(); } };

  $view.querySelector('#ed-back').onclick = () => {
    if (!a.title.trim() && !a.content.trim()) {
      // 全空的文章（新建未写或内容被清空）不保留
      s.articles = s.articles.filter((x) => x.id !== a.id);
    }
    editing = null;
    state.fromEditor = true;
    go('articles');
  };
}

function today() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

/* ================= 标签 ================= */

function tagRow(t) {
  const n = site().articles.filter((a) => a.tags.includes(t.id)).length;
  return '<div class="rowitem" style="cursor:default">' +
    '<span class="ri-main"><span class="ri-title od-keep">' + esc(t.name) + '</span>' +
    '<span class="ri-meta">' + n + ' 篇文章</span></span>' +
    '<span class="ri-side">' +
    '<button class="icon-btn" data-rename="' + t.id + '" aria-label="重命名标签「' + esc(t.name) + '」">' + I.pen + '</button>' +
    '<button class="icon-btn danger" data-del="' + t.id + '" aria-label="删除标签「' + esc(t.name) + '」">' + I.trash + '</button>' +
    '</span></div>';
}

function tagFormModal(t) {
  const isNew = !t;
  const m = openModal(
    '<h3>' + (isNew ? '新建标签' : '重命名标签') + '</h3>' +
    '<p class="dlg-msg">' + (isNew ? '给文章一个可复现的主题关键词。' : '修改后会同步到所有使用它的文章。') + '</p>' +
    '<div class="dlg-field"><label>名称<span class="req">*</span></label>' +
    '<input class="input" id="tf-name" placeholder="例如：徒步" value="' + (t ? esc(t.name) : '') + '"></div>' +
    '<span class="field-err" id="tf-err" hidden></span>' +
    '<div class="dlg-actions"><button class="btn btn-ghost" data-x="no">取消</button>' +
    '<button class="btn btn-primary" data-x="yes">' + (isNew ? '创建' : '保存') + '</button></div>'
  );
  const $n = m.querySelector('#tf-name');
  const $err = m.querySelector('#tf-err');
  $n.focus();
  $n.onkeydown = (e) => { if (e.key === 'Enter') m.querySelector('[data-x="yes"]').click(); };
  m.querySelector('[data-x="no"]').onclick = closeModal;
  m.querySelector('[data-x="yes"]').onclick = () => {
    const name = $n.value.trim();
    if (!name) { $err.textContent = '名称不能为空'; $err.hidden = false; $n.classList.add('invalid'); return; }
    if (site().tags.some((x) => x.name === name && (!t || x.id !== t.id))) {
      $err.textContent = '已有同名标签'; $err.hidden = false; $n.classList.add('invalid'); return;
    }
    if (isNew) site().tags.push({ id: uid('t'), name });
    else t.name = name;
    closeModal();
    toast(isNew ? '标签「' + name + '」已创建' : '标签已重命名');
    render();
  };
}

function deleteTag(id) {
  const t = site().tags.find((x) => x.id === id);
  if (!t) return;
  const used = site().articles.filter((a) => a.tags.includes(id)).length;
  confirmModal({
    title: '删除标签',
    html: '标签 <b>' + esc(t.name) + '</b> 正被 ' + used + ' 篇文章使用，删除后将从这些文章中移除。',
    confirmText: '删除',
    danger: true,
    onConfirm: () => {
      const s = site();
      s.tags = s.tags.filter((x) => x.id !== id);
      s.articles.forEach((a) => { a.tags = a.tags.filter((x) => x !== id); });
      toast('标签已删除');
      render();
    },
  });
}

function viewTags() {
  const s = site();
  const body = s.tags.length
    ? '<div class="card"><div class="rowlist">' + s.tags.map(tagRow).join('') + '</div></div>'
    : '<div class="card">' + emptyState(I.tag, '还没有标签', '标签帮助读者按主题找到相关文章。', '<button class="btn btn-primary" data-new="1">' + I.plus + '新建标签</button>') + '</div>';
  $view.className = 'view';
  $view.scrollTop = 0;
  $view.innerHTML =
    '<div class="page-head od-row">' +
    '<div class="od-fill"><div class="ph-title">标签</div><div class="ph-sub">共 ' + s.tags.length + ' 个</div></div>' +
    (s.tags.length ? '<button class="btn btn-primary od-fixed" data-new="1">' + I.plus + '新建标签</button>' : '') +
    '</div>' + body;
  $view.querySelectorAll('[data-new]').forEach((b) => { b.onclick = () => tagFormModal(null); });
  $view.querySelectorAll('[data-rename]').forEach((b) => {
    b.onclick = () => tagFormModal(s.tags.find((x) => x.id === b.dataset.rename));
  });
  $view.querySelectorAll('[data-del]').forEach((b) => { b.onclick = () => deleteTag(b.dataset.del); });
}

/* ================= 分类 ================= */

function catRow(c) {
  const n = site().articles.filter((a) => a.category === c.id).length;
  return '<div class="rowitem" style="cursor:default">' +
    '<span class="ri-main"><span class="ri-title od-keep">' + esc(c.name) + '</span>' +
    '<span class="ri-meta">' + n + ' 篇文章</span></span>' +
    '<span class="ri-side">' +
    '<button class="icon-btn" data-rename="' + c.id + '" aria-label="重命名分类「' + esc(c.name) + '」">' + I.pen + '</button>' +
    '<button class="icon-btn danger" data-del="' + c.id + '" aria-label="删除分类「' + esc(c.name) + '」">' + I.trash + '</button>' +
    '</span></div>';
}

function catFormModal(c) {
  const isNew = !c;
  const m = openModal(
    '<h3>' + (isNew ? '新建分类' : '重命名分类') + '</h3>' +
    '<p class="dlg-msg">' + (isNew ? '分类是文章的一级归属，一篇文章只属于一个分类。' : '修改后会同步到所有使用它的文章。') + '</p>' +
    '<div class="dlg-field"><label>名称<span class="req">*</span></label>' +
    '<input class="input" id="cf-name" placeholder="例如：户外" value="' + (c ? esc(c.name) : '') + '"></div>' +
    '<span class="field-err" id="cf-err" hidden></span>' +
    '<div class="dlg-actions"><button class="btn btn-ghost" data-x="no">取消</button>' +
    '<button class="btn btn-primary" data-x="yes">' + (isNew ? '创建' : '保存') + '</button></div>'
  );
  const $n = m.querySelector('#cf-name');
  const $err = m.querySelector('#cf-err');
  $n.focus();
  $n.onkeydown = (e) => { if (e.key === 'Enter') m.querySelector('[data-x="yes"]').click(); };
  m.querySelector('[data-x="no"]').onclick = closeModal;
  m.querySelector('[data-x="yes"]').onclick = () => {
    const name = $n.value.trim();
    if (!name) { $err.textContent = '名称不能为空'; $err.hidden = false; $n.classList.add('invalid'); return; }
    if (site().categories.some((x) => x.name === name && (!c || x.id !== c.id))) {
      $err.textContent = '已有同名分类'; $err.hidden = false; $n.classList.add('invalid'); return;
    }
    if (isNew) site().categories.push({ id: uid('c'), name });
    else c.name = name;
    closeModal();
    toast(isNew ? '分类「' + name + '」已创建' : '分类已重命名');
    render();
  };
}

function deleteCategory(id) {
  const c = site().categories.find((x) => x.id === id);
  if (!c) return;
  const used = site().articles.filter((a) => a.category === id).length;
  confirmModal({
    title: '删除分类',
    html: '分类 <b>' + esc(c.name) + '</b> 下有 ' + used + ' 篇文章，删除后这些文章将变为「未分类」。',
    confirmText: '删除',
    danger: true,
    onConfirm: () => {
      const s = site();
      s.categories = s.categories.filter((x) => x.id !== id);
      s.articles.forEach((a) => { if (a.category === id) a.category = null; });
      toast('分类已删除');
      render();
    },
  });
}

function viewCategories() {
  const s = site();
  const body = s.categories.length
    ? '<div class="card"><div class="rowlist">' + s.categories.map(catRow).join('') + '</div></div>'
    : '<div class="card">' + emptyState(I.folderBig, '还没有分类', '分类让博客结构清晰，读者可以按栏目浏览。', '<button class="btn btn-primary" data-new="1">' + I.plus + '新建分类</button>') + '</div>';
  $view.className = 'view';
  $view.scrollTop = 0;
  $view.innerHTML =
    '<div class="page-head od-row">' +
    '<div class="od-fill"><div class="ph-title">分类</div><div class="ph-sub">共 ' + s.categories.length + ' 个</div></div>' +
    (s.categories.length ? '<button class="btn btn-primary od-fixed" data-new="1">' + I.plus + '新建分类</button>' : '') +
    '</div>' + body;
  $view.querySelectorAll('[data-new]').forEach((b) => { b.onclick = () => catFormModal(null); });
  $view.querySelectorAll('[data-rename]').forEach((b) => {
    b.onclick = () => catFormModal(s.categories.find((x) => x.id === b.dataset.rename));
  });
  $view.querySelectorAll('[data-del]').forEach((b) => { b.onclick = () => deleteCategory(b.dataset.del); });
}

/* ================= 主题 ================= */

const THEMES = [
  {
    id: 'mobai', name: '墨白', layout: 'single', serif: true,
    desc: '极简单栏，留白优先，衬线标题，适合纯文字写作。',
    tags: ['单栏', '极简', '衬线'],
    preview: { bg: '#FFFFFF', chromeBg: '#FAFAFA', ink: '#1F2328', muted: '#6B7280', line: '#E5E7EB', accent: '#3563D9' },
  },
  {
    id: 'shanwu', name: '山雾', layout: 'cards', serif: false,
    desc: '柔和的青绿色调，卡片式文章列表，适合图文记录。',
    tags: ['卡片', '清新', '图文'],
    preview: { bg: '#F2F6F3', chromeBg: '#FFFFFF', ink: '#223B2F', muted: '#5E7A6B', line: '#DCE8E0', accent: '#2E7D5B' },
  },
  {
    id: 'yehang', name: '夜航', layout: 'single', serif: false,
    desc: '深色低亮度配色，夜间写作与阅读都友好。',
    tags: ['深色', '单栏', '夜间'],
    preview: { bg: '#14171C', chromeBg: '#1B2027', ink: '#E8EAED', muted: '#9AA3B2', line: '#262C35', accent: '#7C9CF5' },
  },
  {
    id: 'zazhi', name: '杂志', layout: 'magazine', serif: true,
    desc: '双栏编辑排版，大号衬线标题，适合随笔与专栏。',
    tags: ['双栏', '杂志', '衬线'],
    preview: { bg: '#FFFFFF', chromeBg: '#F7F5F2', ink: '#141414', muted: '#6E675E', line: '#E7E2DB', accent: '#B03A2E' },
  },
];

function themeById(id) { return THEMES.find((t) => t.id === id) || THEMES[0]; }

function themeThumb(t) {
  const p = t.preview;
  const chrome =
    '<div class="tt-chrome" style="background:' + p.chromeBg + '">' +
    '<i class="tt-dot" style="background:' + p.accent + '"></i>' +
    '<i class="tt-dot" style="background:' + p.line + '"></i>' +
    '<i class="tt-dot" style="background:' + p.line + '"></i></div>';
  const title = '<i class="tt-line tt-title" style="background:' + p.ink + '"></i>';
  const meta = '<i class="tt-line tt-meta" style="background:' + p.ink + '"></i>';
  const line = '<i class="tt-line" style="background:' + p.line + '"></i>';
  const lines = (n) => new Array(n).fill(line).join('');
  let body = '';
  if (t.layout === 'cards') {
    const card = (inner) => '<div class="tt-card" style="background:' + p.chromeBg + ';border:1px solid ' + p.line + '">' + inner + '</div>';
    body = '<div class="tt-cols">' + card(title + meta + line) + card(title + meta + line) + '</div>' + line;
  } else if (t.layout === 'magazine') {
    body = '<div class="tt-cols">' +
      '<div class="tt-col" style="flex:1.6">' + title + meta + lines(3) + '</div>' +
      '<div class="tt-col" style="border-left:1px solid ' + p.line + ';padding-left:6%">' + lines(4) + '</div></div>';
  } else {
    body = title + meta + line + lines(4);
  }
  return '<div class="theme-thumb" style="background:' + p.bg + '">' + chrome +
    '<div class="tt-body">' + body + '</div>' +
    '<span class="tt-accent" style="background:' + p.accent + '"></span></div>';
}

function themeCard(t, activeId) {
  const active = t.id === activeId;
  return '<div class="theme-card' + (active ? ' active' : '') + '">' +
    themeThumb(t) +
    '<div class="theme-body">' +
    '<div class="theme-name-row"><span class="theme-name">' + t.name + '</span>' +
    (active ? '<span class="chip chip-accent">' + I.checkSm + '使用中</span>' : '') + '</div>' +
    '<span class="theme-desc">' + t.desc + '</span>' +
    '<span class="theme-tags">' + t.tags.map((x) => '<span class="chip chip-tag">' + x + '</span>').join('') + '</span>' +
    '<div class="theme-foot">' +
    (active
      ? '<button class="btn btn-ghost btn-sm" disabled>当前主题</button>'
      : '<button class="btn btn-primary btn-sm" data-use="' + t.id + '">启用此主题</button>') +
    '<button class="btn btn-ghost btn-sm" data-preview="' + t.id + '" aria-label="预览主题「' + t.name + '」">预览</button>' +
    '</div></div></div>';
}

function applyTheme(id) {
  const s = site();
  if (s.theme === id) return;
  s.theme = id;
  toast('已启用「' + themeById(id).name + '」主题');
  render();
}

function viewThemes() {
  const s = site();
  const t = themeById(s.theme);
  $view.className = 'view';
  $view.scrollTop = 0;
  $view.innerHTML =
    '<div class="page-head od-row">' +
    '<div class="od-fill"><div class="ph-title">主题</div>' +
    '<div class="ph-sub">当前站点「' + esc(s.name) + '」· 已启用 ' + esc(t.name) + '</div></div>' +
    '</div>' +
    '<div class="theme-grid">' + THEMES.map((x) => themeCard(x, s.theme)).join('') + '</div>';
  $view.querySelectorAll('[data-use]').forEach((b) => { b.onclick = () => applyTheme(b.dataset.use); });
  $view.querySelectorAll('[data-preview]').forEach((b) => { b.onclick = () => themePreviewModal(b.dataset.preview); });
}

function themePreviewModal(id) {
  const t = themeById(id);
  const s = site();
  const p = t.preview;
  const active = s.theme === t.id;
  const posts = s.articles.slice().sort((a, b) => (b.updated > a.updated ? 1 : -1)).slice(0, 3);
  const list = posts.length ? posts.map((a) =>
    '<div class="pv-post"><span class="pv-post-title">' + esc(a.title || '（无标题）') + '</span>' +
    '<span class="pv-post-meta" style="color:' + p.muted + '">' + esc(fmtDate(a.date)) + ' · ' + a.words.toLocaleString('zh-CN') + ' 字</span></div>'
  ).join('') : '<div class="pv-post"><span class="pv-post-meta" style="color:' + p.muted + '">这个站点还没有文章，启用后从这里开始。</span></div>';
  const m = openModal(
    '<div class="pv-wrap' + (t.serif ? ' pv-serif' : '') + '" style="background:' + p.bg + ';color:' + p.ink + ';--pv-line:' + p.line + '">' +
    '<div class="pv-chrome" style="background:' + p.chromeBg + '"><i class="pv-dot" style="background:' + p.accent + '"></i><span>' + esc(s.name) + '</span></div>' +
    '<div class="pv-hero"><span class="pv-blog-name">' + esc(s.name) + '</span>' +
    '<span class="pv-blog-desc" style="color:' + p.muted + '">' + esc(s.desc || '一个安静的博客') + '</span></div>' +
    '<div class="pv-list">' + list + '</div></div>' +
    '<div class="pv-actions"><span class="pv-note">「' + esc(t.name) + '」· ' + esc(t.desc) + '</span>' +
    '<button class="btn btn-ghost" data-x="close">关闭</button>' +
    (active
      ? '<button class="btn btn-primary" disabled>使用中</button>'
      : '<button class="btn btn-primary" data-x="use">启用此主题</button>') +
    '</div>'
  );
  m.querySelector('.dialog').classList.add('dialog-wide');
  m.querySelector('[data-x="close"]').onclick = closeModal;
  const use = m.querySelector('[data-x="use"]');
  if (use) use.onclick = () => { closeModal(); applyTheme(t.id); };
}

/* ================= 设置 ================= */

function viewSettings() {
  const s = site();
  const st = s.settings;
  const last = db.sites.length <= 1;
  $view.className = 'view';
  $view.scrollTop = 0;
  $view.innerHTML =
    '<div class="page-head od-row">' +
    '<div class="od-fill"><div class="ph-title">设置</div><div class="ph-sub">当前站点：' + esc(s.name) + '</div></div></div>' +
    '<div class="settings-col">' +

    '<div class="card form-card"><div class="card-head"><span class="t">站点信息</span></div>' +
    '<div class="form-grid">' +
    '<div class="f-item"><label for="st-name">站点名称<span class="req">*</span></label><input class="input" id="st-name" value="' + esc(st.name || s.name) + '"></div>' +
    '<div class="f-item"><label for="st-author">作者名</label><input class="input" id="st-author" value="' + esc(st.author) + '"></div>' +
    '<div class="f-item full"><label for="st-desc">站点描述</label><input class="input" id="st-desc" placeholder="一句话介绍这个站点" value="' + esc(s.desc) + '"></div>' +
    '<div class="f-item"><label for="st-lang">界面与内容语言</label><select class="select" id="st-lang">' +
    '<option value="zh-CN"' + (st.lang === 'zh-CN' ? ' selected' : '') + '>简体中文</option>' +
    '<option value="en"' + (st.lang === 'en' ? ' selected' : '') + '>English</option></select></div>' +
    '</div>' +
    '<div class="form-foot"><button class="btn btn-primary" id="st-save">保存更改</button></div></div>' +

    '<div class="card form-card"><div class="card-head"><span class="t">发布配置</span></div>' +
    '<div class="form-grid">' +
    '<div class="f-item"><label for="st-platform">发布平台</label><select class="select" id="st-platform">' +
    '<option' + (st.platform === 'GitHub Pages' ? ' selected' : '') + '>GitHub Pages</option>' +
    '<option' + (st.platform === 'GitLab Pages' ? ' selected' : '') + '>GitLab Pages</option>' +
    '<option' + (st.platform === '本地导出' ? ' selected' : '') + '>本地导出</option></select></div>' +
    '<div class="f-item"><label for="st-branch">分支</label><input class="input" id="st-branch" value="' + esc(st.branch) + '"></div>' +
    '<div class="f-item"><label for="st-repo">仓库地址</label><input class="input" id="st-repo" placeholder="用户名/仓库名" value="' + esc(st.repo) + '"><span class="hint">例如：yuanshan/notes</span></div>' +
    '<div class="f-item"><label for="st-domain">自定义域名</label><input class="input" id="st-domain" placeholder="可选" value="' + esc(st.domain) + '"><span class="hint">留空则使用平台默认域名</span></div>' +
    '</div>' +
    '<div class="form-foot"><button class="btn btn-primary" id="st-save2">保存更改</button></div></div>' +

    '<div class="card form-card danger-zone"><div class="card-head"><span class="t">危险操作</span></div>' +
    '<div class="dz-body"><span class="dz-text">删除「' + esc(s.name) + '」及其全部文章、标签、分类与配置，且无法恢复。</span>' +
    '<button class="btn btn-danger-ghost od-fixed" id="st-del"' + (last ? ' disabled' : '') + '>' + I.trash + '删除站点</button></div>' +
    (last ? '<div class="dz-body" style="padding-top:0"><span class="dz-text">至少保留一个站点，无法删除最后一个。</span></div>' : '') +
    '</div></div>';

  const save = () => {
    const $name = $view.querySelector('#st-name');
    if (!$name.value.trim()) { $name.classList.add('invalid'); $name.focus(); toast('站点名称不能为空', 'err'); return; }
    $name.classList.remove('invalid');
    s.name = $name.value.trim();
    s.desc = $view.querySelector('#st-desc').value.trim();
    st.author = $view.querySelector('#st-author').value.trim();
    st.lang = $view.querySelector('#st-lang').value;
    st.platform = $view.querySelector('#st-platform').value;
    st.branch = $view.querySelector('#st-branch').value.trim();
    st.repo = $view.querySelector('#st-repo').value.trim();
    st.domain = $view.querySelector('#st-domain').value.trim();
    st.name = s.name;
    toast('设置已保存');
    render();
  };
  $view.querySelector('#st-save').onclick = save;
  $view.querySelector('#st-save2').onclick = save;

  $view.querySelector('#st-del').onclick = () => {
    confirmModal({
      title: '删除站点',
      html: '站点 <b>' + esc(s.name) + '</b> 的 ' + s.articles.length + ' 篇文章与全部配置将被永久删除，此操作无法撤销。',
      confirmText: '永久删除',
      danger: true,
      onConfirm: () => {
        db.sites = db.sites.filter((x) => x.id !== s.id);
        state.siteId = db.sites[0].id;
        toast('站点已删除');
        go('dashboard');
        render();
      },
    });
  };
}

/* ================= 新建站点 ================= */

function newSiteModal() {
  const m = openModal(
    '<h3>新建站点</h3>' +
    '<p class="dlg-msg">每个站点拥有独立的文章、标签、分类与发布配置，数据互不干扰。</p>' +
    '<div class="dlg-field"><label>站点名称<span class="req">*</span></label><input class="input" id="ns-name" placeholder="例如：旅行随笔"></div>' +
    '<div class="dlg-field"><label>站点描述</label><input class="input" id="ns-desc" placeholder="一句话介绍（可选）"></div>' +
    '<span class="field-err" id="ns-err" hidden></span>' +
    '<div class="dlg-actions"><button class="btn btn-ghost" data-x="no">取消</button>' +
    '<button class="btn btn-primary" data-x="yes">创建站点</button></div>'
  );
  const $n = m.querySelector('#ns-name');
  $n.focus();
  m.querySelector('[data-x="no"]').onclick = closeModal;
  m.querySelector('[data-x="yes"]').onclick = () => {
    const name = $n.value.trim();
    if (!name) { const e = m.querySelector('#ns-err'); e.textContent = '请给站点起个名字'; e.hidden = false; $n.classList.add('invalid'); return; }
    const hues = ['a', 'b', 'c'];
    const s = mkSite({ name, desc: m.querySelector('#ns-desc').value.trim(), hue: hues[db.sites.length % 3] });
    s.settings.author = '';
    db.sites.push(s);
    closeModal();
    toast('站点「' + name + '」已创建');
    state.siteId = s.id;
    state.query = { q: '', status: 'all' };
    go('dashboard');
    render();
  };
}

/* ================= 启动 ================= */

function pruneEmpty() {
  const s = site();
  if (!s) return;
  const before = s.articles.length;
  s.articles = s.articles.filter((a) => a.title.trim() || a.content.trim() || a === editing);
  if (s.articles.length !== before) renderSidebarLight();
}
function renderSidebarLight() {
  // 空文章被丢弃后同步侧边栏计数
  const cnt = document.querySelector('.switcher-name .ct');
  if (cnt) cnt.textContent = site().articles.length + ' 篇文章';
}

window.addEventListener('hashchange', render);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { closeModal(); closeDrop(); }
});

db = { sites: INITIAL_SITES };
state.siteId = db.sites[0].id;
if (!location.hash) location.hash = '#/dashboard';
render();
