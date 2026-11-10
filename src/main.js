// ゲーム全体の進行（画面遷移・ループ管理）
(function (root) {
  'use strict';
  const { Sim, LEVELS, Input, Audio, Render, IN, T } = root.LM;

  const canvas = document.getElementById('game');
  const g = canvas.getContext('2d');
  const overlay = document.getElementById('overlay');
  const SAVE_KEY = 'loopme-save-v1';

  // 高解像度ディスプレイ対応
  function setupCanvas() {
    const dpr = Math.min(root.devicePixelRatio || 1, 2);
    canvas.width = Render.VIEW_W * dpr;
    canvas.height = Render.VIEW_H * dpr;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  setupCanvas();
  root.addEventListener('resize', setupCanvas);

  // ---- セーブデータ ----
  function loadSave() {
    try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || { best: {} }; }
    catch (e) { return { best: {} }; }
  }
  let save = loadSave();
  function writeSave() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* 保存できなくても遊べる */ }
  }
  const unlocked = (i) => i === 0 || save.best[i - 1] != null;

  // ---- 状態 ----
  const S = {
    screen: 'title', levelIdx: 0, sim: null, ghosts: [],
    state: 'play', anim: 0, animMax: 1, after: null,
    history: [], particles: [], shake: 0,
    banner: null, toast: null, jumpLock: false, lastTick: -1,
  };

  function banner(text, sub, frames) { S.banner = { text, sub, t: frames || 70 }; }
  function toast(text, color, frames) { S.toast = { text, color, t: frames || 110 }; }

  function burst(x, y, color, n, speed) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = (0.5 + Math.random()) * (speed || 3);
      S.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1, life: 40, max: 40, color, size: 3 + Math.random() * 3 });
    }
  }

  // ---- ステージ・ループ ----
  function startLevel(i) {
    S.levelIdx = i;
    S.sim = new Sim(LEVELS[i]);
    S.ghosts = [];
    S.screen = 'play';
    hideOverlay();
    beginLoop();
    banner(`STAGE ${i + 1}`, LEVELS[i].name, 90);
  }

  function beginLoop() {
    S.sim.startLoop(S.ghosts);
    S.history = [];
    S.state = 'play';
    S.jumpLock = true;
    S.lastTick = -1;
    if (S.ghosts.length > 0) banner(`LOOP ${S.ghosts.length + 1}`, `ゴースト ×${S.ghosts.length}`, 50);
  }

  function startRewind(then) {
    S.state = 'rewind';
    S.anim = 0;
    S.animMax = Math.max(24, Math.min(50, Math.round(S.history.length / 8)));
    S.after = then || beginLoop;
    Audio.play('rewind');
  }

  function commitLoop() {
    const def = S.sim.def;
    if (S.ghosts.length + 1 >= def.maxLoops) {
      Audio.play('fail');
      toast(`ループ上限（${def.maxLoops}回）！ 最初からやり直し`, '#ffa8a8', 140);
      S.ghosts = [];
      startRewind();
      return;
    }
    S.ghosts.push(S.sim.rec);
    startRewind();
  }

  function undoLoop() {
    if (!S.ghosts.length) { toast('取り消せるループがありません', '#a9a6d6', 70); return; }
    S.ghosts.pop();
    toast('ひとつ前のループを取り消した', '#a9a6d6', 70);
    startRewind();
  }

  function restartLevel() {
    S.ghosts = [];
    toast('ステージを最初から', '#a9a6d6', 60);
    startRewind();
  }

  function handleEvents(ev) {
    for (const e of ev) {
      switch (e.type) {
        case 'jump': Audio.play('jump'); break;
        case 'land': Audio.play('land'); break;
        case 'star':
          Audio.play('star');
          burst(e.x * T + 16, e.y * T + 16, '#ffe066', 16, 3);
          break;
        case 'key':
          Audio.play('key');
          burst(e.x * T + 16, e.y * T + 16, '#f5c542', 18, 3);
          toast('鍵を取った！ 錠が開いた', '#f5c542', 80);
          break;
        case 'doorOpen': Audio.play('doorOpen'); break;
        case 'doorClose': Audio.play('doorClose'); break;
        case 'ghostLost':
          Audio.play('paradox');
          burst(e.x + 10, e.y + 14, Render.ghostColor(e.idx), 26, 4);
          toast(e.reason === 'paradox'
            ? `パラドックス！ ゴースト${e.idx + 1}が消えた`
            : `ゴースト${e.idx + 1}がやられた`, Render.ghostColor(e.idx), 120);
          break;
        case 'death':
          Audio.play('death');
          burst(e.x + 10, e.y + 14, '#ff9f43', 30, 4);
          S.shake = 10;
          S.state = 'dead';
          S.anim = 0; S.animMax = 50;
          toast('やられた！ このループをやり直し', '#ff9f43', 90);
          return;
        case 'win':
          winLevel();
          return;
        case 'timeout':
          commitLoop();
          return;
        default: break;
      }
    }
  }

  function winLevel() {
    const loops = S.ghosts.length + 1;
    const i = S.levelIdx;
    const prev = save.best[i];
    const isBest = prev == null || loops < prev;
    if (isBest) { save.best[i] = loops; writeSave(); }
    Audio.play('clear');
    const p = S.sim.player;
    burst(p.x + 10, p.y + 14, '#8ce99a', 40, 5);
    S.state = 'clear';
    S.anim = 0;
    setTimeout(() => showClear(loops, isBest && prev != null), 700);
  }

  // ---- 1フレーム更新 ----
  function update() {
    for (const a of Input.takeActions()) onAction(a);

    if (S.banner && S.banner.t > 0) S.banner.t--;
    if (S.toast && S.toast.t > 0) S.toast.t--;
    if (S.shake > 0) S.shake = Math.max(0, S.shake - 0.7);
    for (const p of S.particles) { p.x += p.vx; p.y += p.vy; p.vy += 0.12; p.life--; }
    S.particles = S.particles.filter((p) => p.life > 0);

    if (S.screen !== 'play' || !S.sim) return;

    if (S.state === 'play') {
      let bits = Input.bits();
      // ループ開始時にジャンプを押しっぱなしなら、一度離すまで無効
      if (S.jumpLock) { if (bits & IN.J) bits &= ~IN.J; else S.jumpLock = false; }
      const ev = S.sim.step(bits);
      S.history.push(S.sim.actors.map((a) => [a.x, a.y, a.alive]));
      const remain = S.sim.loopFrames - S.sim.frame;
      const sec = Math.ceil(remain / 60);
      if (sec <= 3 && sec !== S.lastTick && remain > 0) { S.lastTick = sec; Audio.play('tick'); }
      handleEvents(ev);
    } else if (S.state === 'rewind') {
      S.anim++;
      if (S.anim >= S.animMax) { const f = S.after; S.after = null; f(); }
    } else if (S.state === 'dead') {
      S.anim++;
      if (S.anim >= S.animMax) beginLoop();
    }
  }

  function onAction(a) {
    if (a === 'mute') {
      const m = Audio.toggleMute();
      const btn = document.querySelector('[data-action="mute"]');
      if (btn) btn.textContent = m ? '🔇' : '🔊';
      if (S.screen === 'play') toast(m ? '音：オフ' : '音：オン', '#a9a6d6', 50);
      return;
    }
    if (S.screen === 'play') {
      if (a === 'menu') { showSelect(); return; }
      if (S.state === 'play') {
        if (a === 'rewind') { if (S.sim.frame > 10) commitLoop(); }
        else if (a === 'undo') undoLoop();
        else if (a === 'restart') restartLevel();
      } else if (S.state === 'dead') {
        if (a === 'undo') undoLoop();
        else if (a === 'restart') restartLevel();
      }
      return;
    }
    // メニュー画面
    if (a === 'confirm') {
      const primary = overlay.querySelector('[data-primary]');
      if (primary) primary.click();
    } else if (a === 'menu') {
      const back = overlay.querySelector('[data-back]');
      if (back) back.click();
    } else if (a === 'rewind' && S.screen === 'clear') {
      startLevel(S.levelIdx);
    }
  }

  // ---- 画面（HTMLオーバーレイ） ----
  function hideOverlay() { overlay.classList.add('hidden'); overlay.innerHTML = ''; }
  function showOverlay(html) {
    overlay.innerHTML = html;
    overlay.classList.remove('hidden');
    overlay.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => Audio.play('click')));
  }

  function showTitle() {
    S.screen = 'title';
    showOverlay(`
      <div class="panel title">
        <div class="logo">LOOP<span>ME</span></div>
        <div class="logo-ja">ループ・ミー</div>
        <p class="tagline">10秒ごとに時間が巻き戻る。<br>さっきまでの自分は、今の自分の味方になる。</p>
        <div class="buttons">
          <button class="btn primary" data-primary id="b-start">${save.best[0] != null ? 'つづきから' : 'スタート'}</button>
          <button class="btn" id="b-select">ステージ選択</button>
        </div>
        <ul class="controls">
          <li><kbd>←</kbd><kbd>→</kbd> 移動　<kbd>Space</kbd> ジャンプ</li>
          <li><kbd>R</kbd> 巻き戻し（今の動きがゴーストになる）</li>
          <li><kbd>U</kbd> ひとつ前のループを取り消し　<kbd>X</kbd> ステージをやり直し</li>
        </ul>
      </div>`);
    overlay.querySelector('#b-start').addEventListener('click', () => {
      let i = 0;
      while (i < LEVELS.length - 1 && save.best[i] != null) i++;
      startLevel(i);
    });
    overlay.querySelector('#b-select').addEventListener('click', showSelect);
  }

  function showSelect() {
    S.screen = 'select';
    const cards = LEVELS.map((lv, i) => {
      const best = save.best[i];
      const open = unlocked(i);
      const medal = best == null ? '' : best <= lv.par ? '<span class="medal">★ パーフェクト</span>' : '<span class="medal dim">クリア</span>';
      return `<button class="card ${open ? '' : 'locked'}" ${open ? '' : 'disabled'} data-i="${i}">
          <span class="num">${i + 1}</span>
          <span class="name">${open ? lv.name : '？？？'}</span>
          <span class="meta">${open ? (best != null ? `ベスト ${best} ループ / 目標 ${lv.par}` : `目標 ${lv.par} ループ`) : 'ロック中'}</span>
          ${medal}
        </button>`;
    }).join('');
    showOverlay(`
      <div class="panel select">
        <h2>ステージ選択</h2>
        <div class="grid">${cards}</div>
        <div class="buttons"><button class="btn" data-back id="b-back">タイトルへ</button></div>
      </div>`);
    overlay.querySelectorAll('.card:not(.locked)').forEach((b) => b.addEventListener('click', () => startLevel(Number(b.dataset.i))));
    overlay.querySelector('#b-back').addEventListener('click', showTitle);
    const first = overlay.querySelector('.card:not(.locked)');
    if (first) first.setAttribute('data-primary', '');
  }

  function showClear(loops, newBest) {
    S.screen = 'clear';
    const lv = LEVELS[S.levelIdx];
    const last = S.levelIdx === LEVELS.length - 1;
    const perfect = loops <= lv.par;
    showOverlay(`
      <div class="panel clear">
        <h2>${last ? '全ステージクリア！' : 'STAGE CLEAR!'}</h2>
        <div class="result">
          <div><span class="big">${loops}</span> ループ</div>
          <div class="sub">目標 ${lv.par} ループ${newBest ? '　<b>ベスト更新！</b>' : ''}</div>
          <div class="rank ${perfect ? 'perfect' : ''}">${perfect ? '★ パーフェクト！' : 'もっと少ないループで行けるかも？'}</div>
        </div>
        ${last ? '<p class="tagline">遊んでくれてありがとう！ 全部パーフェクトを目指してみよう。</p>' : ''}
        <div class="buttons">
          ${last ? '' : '<button class="btn primary" data-primary id="b-next">次のステージ</button>'}
          <button class="btn ${last ? 'primary' : ''}" ${last ? 'data-primary' : ''} id="b-retry">もう一度 <kbd>R</kbd></button>
          <button class="btn" data-back id="b-sel">ステージ選択</button>
        </div>
      </div>`);
    const nx = overlay.querySelector('#b-next');
    if (nx) nx.addEventListener('click', () => startLevel(S.levelIdx + 1));
    overlay.querySelector('#b-retry').addEventListener('click', () => startLevel(S.levelIdx));
    overlay.querySelector('#b-sel').addEventListener('click', showSelect);
  }

  // ---- メインループ（60fps 固定ステップ） ----
  let acc = 0;
  let lastT = performance.now();
  function frame(now) {
    acc += Math.min(100, now - lastT);
    lastT = now;
    while (acc >= 1000 / 60) { update(); acc -= 1000 / 60; }
    Render.render(g, S, now / 1000);
    requestAnimationFrame(frame);
  }

  Input.bindTouch(document.getElementById('touch'));
  const muteBtn = document.querySelector('[data-action="mute"]');
  if (muteBtn) muteBtn.textContent = Audio.isMuted() ? '🔇' : '🔊';

  // タイトル画面の背景として、ステージ1を表示しておく
  S.sim = new Sim(LEVELS[0]);
  S.sim.startLoop([]);
  showTitle();
  requestAnimationFrame(frame);

  root.LM.Game = { S, startLevel };
})(window);
