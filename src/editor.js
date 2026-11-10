// ステージエディタ：タイルを置いてステージを作り、テストプレイ・保存・共有コードでやりとりする
(function (root) {
  'use strict';
  const { Sim, T, Render, Audio } = root.LM;
  const W = 24, H = 14;
  const STORE_KEY = 'loopme-custom-v1';
  const CODE_PREFIX = 'LOOPME1:';
  const MAX_SLOTS = 12;

  const PALETTE = [
    ['.', '消す', 'transparent'], ['#', '壁', '#5b55a8'], ['^', 'トゲ', '#cfd4e6'],
    ['P', 'スタート', '#ff9f43'], ['G', 'ゴール', '#2b8a3e'], ['*', '星', '#ffe066'],
    ['a', 'スイッチ赤', '#ff6b6b'], ['A', '扉 赤', '#ff6b6b'],
    ['b', 'スイッチ青', '#4dabf7'], ['B', '扉 青', '#4dabf7'],
    ['c', 'スイッチ緑', '#51cf66'], ['C', '扉 緑', '#51cf66'],
    ['e', '橋スイッチ', '#3bc9db'], ['E', 'かけ橋', '#3bc9db'],
    ['t', '時限スイッチ', '#f06595'], ['T', '時限扉', '#f06595'],
    ['k', '鍵', '#f5c542'], ['L', '錠', '#f5c542'],
    ['S', 'ジャンプ台', '#ff6b6b'], ['-', 'すり抜け床', '#9d8cff'], ['~', 'くずれる床', '#7a5a3a'],
    ['1', 'ワープ1', '#cc5de8'], ['2', 'ワープ2', '#22b8cf'], ['m', '敵', '#fa5252'],
  ];
  const ALLOWED = new Set(PALETTE.map((p) => p[0]));
  const UNIQUE = new Set(['P', 'G', 'k']);
  const PLATE = { a: 1, b: 1, c: 1, e: 1, t: 1 };

  const bar = document.getElementById('editor');
  const canvas = document.getElementById('game');
  let ed = null; // 編集中のステージ
  let tool = '#';
  let painting = null;
  let hover = null;
  let slot = -1;

  function blankMap() {
    const rows = [];
    for (let y = 0; y < H; y++) {
      let r = '';
      for (let x = 0; x < W; x++) r += (x === 0 || y === 0 || x === W - 1 || y === H - 1) ? '#' : '.';
      rows.push(r.split(''));
    }
    rows[H - 2][1] = 'P';
    rows[H - 2][W - 3] = 'G';
    return rows;
  }

  function newStage() {
    return { name: 'わたしのステージ', theme: 'night', time: 10, maxLoops: 4, par: 2, grid: blankMap() };
  }

  function toDef(st, lenient) {
    return {
      name: st.name || '無題', theme: st.theme, time: st.time, maxLoops: st.maxLoops, par: st.par,
      map: st.grid.map((r) => r.join('')), lenient: !!lenient,
    };
  }
  function fromDef(d) {
    return {
      name: d.name, theme: d.theme || 'night', time: d.time, maxLoops: d.maxLoops, par: d.par || d.maxLoops,
      grid: d.map.map((r) => r.split('')),
    };
  }

  // ---- 保存 ----
  function list() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || []; } catch (e) { return []; }
  }
  function writeList(arr) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(arr)); return true; } catch (e) { return false; }
  }

  // ---- 共有コード ----
  function encode(st) {
    const d = toDef(st);
    const json = JSON.stringify({ n: d.name, th: d.theme, t: d.time, ml: d.maxLoops, p: d.par, m: d.map });
    return CODE_PREFIX + btoa(unescape(encodeURIComponent(json)));
  }
  function decode(code) {
    const raw = code.trim().replace(/\s+/g, '');
    if (!raw.startsWith(CODE_PREFIX)) throw new Error('「LOOPME1:」で始まるコードを貼ってください');
    let o;
    try { o = JSON.parse(decodeURIComponent(escape(atob(raw.slice(CODE_PREFIX.length))))); }
    catch (e) { throw new Error('コードが途中で切れているか、壊れています'); }
    if (!Array.isArray(o.m) || o.m.length !== H || o.m.some((r) => typeof r !== 'string' || r.length !== W)) {
      throw new Error(`マップの大きさが ${W}×${H} ではありません`);
    }
    for (const r of o.m) for (const c of r) if (!ALLOWED.has(c)) throw new Error(`使えない記号「${c}」が入っています`);
    return fromDef({
      name: String(o.n || '無題').slice(0, 24), theme: ['night', 'factory', 'rift'].includes(o.th) ? o.th : 'night',
      time: clampInt(o.t, 3, 30, 10), maxLoops: clampInt(o.ml, 1, 8, 4), par: clampInt(o.p, 1, 8, 2), map: o.m,
    });
  }
  function clampInt(v, lo, hi, def) {
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def;
  }

  // 遊べる状態かを確かめる
  function problems(st) {
    const out = [];
    const count = {};
    st.grid.forEach((r) => r.forEach((c) => { count[c] = (count[c] || 0) + 1; }));
    if (!count.P) out.push('スタート（P）を置いてください');
    if (!count.G) out.push('ゴール（G）を置いてください');
    for (const d of ['1', '2']) if (count[d] && count[d] !== 2) out.push(`ワープ${d}は2つ1組で置いてください（今は${count[d]}つ）`);
    for (const [plate, door] of [['a', 'A'], ['b', 'B'], ['c', 'C'], ['e', 'E'], ['t', 'T']]) {
      if (count[door] && !count[plate]) out.push(`「${door}」を開けるスイッチ（${plate}）がありません`);
    }
    if (count.L && !count.k) out.push('錠（L）を開ける鍵（k）がありません');
    return out;
  }

  // ---- 描画 ----
  function refresh() {
    const S = root.LM.Game.S;
    S.theme = ed.theme;
    S.sim = new Sim(toDef(ed, true));
    S.sim.startLoop([]);
    S.ghosts = [];
    S.history = [];
  }

  function drawEditor(g) {
    g.save();
    g.strokeStyle = 'rgba(255,255,255,0.08)';
    g.lineWidth = 1;
    for (let x = 0; x <= W; x++) { g.beginPath(); g.moveTo(x * T + 0.5, 0); g.lineTo(x * T + 0.5, H * T); g.stroke(); }
    for (let y = 0; y <= H; y++) { g.beginPath(); g.moveTo(0, y * T + 0.5); g.lineTo(W * T, y * T + 0.5); g.stroke(); }
    // スタート位置のキャラ
    const S = root.LM.Game.S;
    const p = S.sim.player;
    if (p) {
      g.globalAlpha = 0.9;
      g.fillStyle = Render.COLOR.player;
      g.fillRect(p.x, p.y, p.w, p.h);
      g.globalAlpha = 1;
    }
    if (hover) {
      g.strokeStyle = '#22d3ee';
      g.lineWidth = 2;
      g.strokeRect(hover.x * T + 1, hover.y * T + 1, T - 2, T - 2);
    }
    g.restore();
  }

  // ---- 入力 ----
  function cellAt(e) {
    const r = canvas.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * Render.VIEW_W;
    const y = ((e.clientY - r.top) / r.height) * Render.VIEW_H - Render.HUD;
    const cx = Math.floor(x / T), cy = Math.floor(y / T);
    if (cx < 0 || cy < 0 || cx >= W || cy >= H) return null;
    return { x: cx, y: cy };
  }

  function paint(c, ch) {
    if (!c) return;
    if (ed.grid[c.y][c.x] === ch) return;
    if (UNIQUE.has(ch)) ed.grid.forEach((r) => r.forEach((v, i) => { if (v === ch) r[i] = '.'; }));
    // P と G は消さない（別の場所に置き直す）
    const old = ed.grid[c.y][c.x];
    if ((old === 'P' || old === 'G') && ch !== old) return;
    ed.grid[c.y][c.x] = ch;
    refresh();
  }

  function isOpen() { return root.LM.Game.S.screen === 'editor'; }

  canvas.addEventListener('pointerdown', (e) => {
    if (!isOpen()) return;
    e.preventDefault();
    const c = cellAt(e);
    painting = e.button === 2 ? '.' : tool;
    paint(c, painting);
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* 無視 */ }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!isOpen()) return;
    hover = cellAt(e);
    if (painting && !UNIQUE.has(painting)) paint(hover, painting);
  });
  const stop = () => { painting = null; };
  canvas.addEventListener('pointerup', stop);
  canvas.addEventListener('pointercancel', stop);
  canvas.addEventListener('pointerleave', () => { hover = null; });
  canvas.addEventListener('contextmenu', (e) => { if (isOpen()) e.preventDefault(); });

  // ---- ツールバー ----
  function swatch(p) {
    const [ch, label, color] = p;
    const style = ch === '.' ? 'background: repeating-linear-gradient(45deg,#2a2660 0 4px,#1c1940 4px 8px)'
      : PLATE[ch] ? `background: linear-gradient(transparent 60%, ${color} 60%)`
        : `background:${color}`;
    return `<button class="tile ${ch === tool ? 'on' : ''}" data-tile="${ch === '"' ? '&quot;' : ch}" title="${label}">
      <span class="sw" style="${style}">${/[0-9]/.test(ch) ? ch : ch === 'm' ? '●' : ''}</span><span>${label}</span></button>`;
  }

  function renderBar(msg, msgKind) {
    const saved = list();
    const esc = root.LM.Game.escapeHtml;
    bar.innerHTML = `
      <div class="ed-row palette">${PALETTE.map(swatch).join('')}</div>
      <div class="ed-row fields">
        <label>名前 <input id="ed-name" maxlength="24" value="${esc(ed.name)}"></label>
        <label>時間 <input id="ed-time" type="number" min="3" max="30" value="${ed.time}">秒</label>
        <label>最大ループ <input id="ed-max" type="number" min="1" max="8" value="${ed.maxLoops}"></label>
        <label>目標 <input id="ed-par" type="number" min="1" max="8" value="${ed.par}"></label>
        <label>背景 <select id="ed-theme">
          <option value="night" ${ed.theme === 'night' ? 'selected' : ''}>時計塔</option>
          <option value="factory" ${ed.theme === 'factory' ? 'selected' : ''}>工場</option>
          <option value="rift" ${ed.theme === 'rift' ? 'selected' : ''}>裂け目</option>
        </select></label>
      </div>
      <div class="ed-row actions">
        <button class="btn primary" id="ed-test">▶ テストプレイ</button>
        <button class="btn" id="ed-save">保存${slot >= 0 ? '（上書き）' : ''}</button>
        <button class="btn" id="ed-new">新しく作る</button>
        <select id="ed-load" aria-label="保存したステージを開く">
          <option value="">保存したステージを開く…</option>
          ${saved.map((s, i) => `<option value="${i}" ${i === slot ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}
        </select>
        <button class="btn" id="ed-del" ${slot >= 0 ? '' : 'disabled'}>削除</button>
        <button class="btn" id="ed-exit">終わる</button>
      </div>
      <div class="ed-row share">
        <textarea id="ed-code" rows="2" placeholder="共有コード（LOOPME1:…）をここに貼って「コードを読み込む」"></textarea>
        <div class="share-btns">
          <button class="btn" id="ed-copy">共有コードを作る</button>
          <button class="btn" id="ed-import">コードを読み込む</button>
        </div>
      </div>
      <p class="ed-msg ${msgKind || ''}" role="status">${msg || ''}</p>`;

    bar.querySelectorAll('[data-tile]').forEach((b) => b.addEventListener('click', () => {
      tool = b.dataset.tile;
      bar.querySelectorAll('.tile').forEach((x) => x.classList.toggle('on', x === b));
    }));
    const num = (id, lo, hi, key) => bar.querySelector(id).addEventListener('change', (e) => {
      ed[key] = clampInt(e.target.value, lo, hi, ed[key]); e.target.value = ed[key]; refresh();
    });
    bar.querySelector('#ed-name').addEventListener('input', (e) => { ed.name = e.target.value.slice(0, 24); refresh(); });
    num('#ed-time', 3, 30, 'time');
    num('#ed-max', 1, 8, 'maxLoops');
    num('#ed-par', 1, 8, 'par');
    bar.querySelector('#ed-theme').addEventListener('change', (e) => { ed.theme = e.target.value; refresh(); });

    bar.querySelector('#ed-test').addEventListener('click', () => {
      const pr = problems(ed);
      if (pr.length) { renderBar(pr.join(' ／ '), 'err'); return; }
      root.LM.Game.startCustom(toDef(ed), 'editor');
    });
    bar.querySelector('#ed-save').addEventListener('click', () => {
      const arr = list();
      const d = toDef(ed);
      delete d.lenient;
      if (slot >= 0 && slot < arr.length) arr[slot] = d;
      else {
        if (arr.length >= MAX_SLOTS) { renderBar(`保存できるのは${MAX_SLOTS}個までです。いらないものを削除してください`, 'err'); return; }
        arr.push(d); slot = arr.length - 1;
      }
      const ok = writeList(arr);
      renderBar(ok ? `「${esc(ed.name)}」を保存しました` : 'このブラウザでは保存できませんでした。共有コードで残しておいてください', ok ? 'ok' : 'err');
    });
    bar.querySelector('#ed-new').addEventListener('click', () => { ed = newStage(); slot = -1; refresh(); renderBar('新しいステージ'); });
    bar.querySelector('#ed-load').addEventListener('change', (e) => {
      if (e.target.value === '') return;
      const i = Number(e.target.value);
      ed = fromDef(list()[i]); slot = i; refresh(); renderBar(`「${esc(ed.name)}」を開きました`);
    });
    bar.querySelector('#ed-del').addEventListener('click', (e) => {
      if (slot < 0) return;
      const btn = e.currentTarget;
      if (!btn.dataset.confirm) { btn.dataset.confirm = '1'; btn.textContent = '本当に削除する'; btn.classList.add('danger'); return; }
      const arr = list();
      const name = arr[slot] ? arr[slot].name : '';
      arr.splice(slot, 1); writeList(arr); slot = -1;
      renderBar(`「${esc(name)}」を削除しました（編集中の内容は残っています）`);
    });
    bar.querySelector('#ed-exit').addEventListener('click', close);
    bar.querySelector('#ed-copy').addEventListener('click', () => {
      const code = encode(ed);
      const ta = bar.querySelector('#ed-code');
      ta.value = code;
      const done = () => renderBar('共有コードをコピーしました。友だちに送って「コードを読み込む」で遊べます', 'ok');
      const fallback = () => { ta.focus(); ta.select(); setMsg('コードを選択しました。コピーして送ってください', 'ok'); };
      try {
        navigator.clipboard.writeText(code).then(() => { done(); bar.querySelector('#ed-code').value = code; }, fallback);
      } catch (err) { fallback(); }
    });
    bar.querySelector('#ed-import').addEventListener('click', () => {
      const ta = bar.querySelector('#ed-code');
      try {
        ed = decode(ta.value); slot = -1; refresh();
        renderBar(`「${esc(ed.name)}」を読み込みました。「保存」で残せます`, 'ok');
      } catch (err) { setMsg(err.message, 'err'); }
    });
  }
  function setMsg(msg, kind) {
    const el = bar.querySelector('.ed-msg');
    if (el) { el.textContent = msg; el.className = 'ed-msg ' + (kind || ''); }
  }

  function open() {
    const G = root.LM.Game;
    if (!ed) ed = newStage();
    G.hideOverlay();
    G.S.screen = 'editor';
    G.S.custom = null;
    G.S.drawEditor = drawEditor;
    G.S.fade = 0;
    G.S.banner = null; G.S.toast = null;
    refresh();
    Audio.music('title');
    bar.hidden = false;
    document.body.classList.add('editing');
    renderBar('パレットからタイルを選んで、マップをクリック。右クリックで消せます');
  }
  function hideBar() { bar.hidden = true; document.body.classList.remove('editing'); }
  function close() { hideBar(); root.LM.Game.showSelect(); }

  root.LM.Editor = { open, hideBar, list, encode, decode, problems };
})(window);
