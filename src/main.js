// ゲーム全体の進行（画面遷移・ループ管理・セーブ）
(function (root) {
  'use strict';
  const { Sim, LEVELS, WORLDS, ENDING, Input, Audio, Render, IN, T } = root.LM;

  const canvas = document.getElementById('game');
  const g = canvas.getContext('2d');
  const overlay = document.getElementById('overlay');
  const SAVE_KEY = 'loopme-save-v1';

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
    let d = null;
    try { d = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { d = null; }
    d = d || {};
    return { best: d.best || {}, time: d.time || {}, seen: d.seen || {}, ending: !!d.ending };
  }
  const save = loadSave();
  function writeSave() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* 保存できなくても遊べる */ }
  }
  const unlocked = (i) => i === 0 || save.best[i - 1] != null;
  const worldOf = (i) => WORLDS.findIndex((w) => i >= w.start && i < w.start + w.count);
  const stageLabel = (i) => { const w = worldOf(i); return `${w + 1}-${i - WORLDS[w].start + 1}`; };

  // ---- 状態 ----
  const S = {
    screen: 'title', levelIdx: 0, sim: null, ghosts: [],
    state: 'play', anim: 0, animMax: 1, after: null,
    history: [], particles: [], shake: 0, fade: 0,
    banner: null, toast: null, jumpLock: false, lastTick: -1,
    theme: 'night', stageLabel: '', totalFrames: 0, springFx: {},
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
  function startLevel(i, skipStory) {
    const w = worldOf(i);
    if (!skipStory && i === WORLDS[w].start && !save.seen[w]) {
      showStory(WORLDS[w].name, `WORLD ${w + 1}`, WORLDS[w].story, 'はじめる', () => {
        save.seen[w] = true; writeSave(); startLevel(i, true);
      });
      return;
    }
    S.levelIdx = i;
    S.theme = WORLDS[w].theme;
    S.stageLabel = stageLabel(i);
    S.sim = new Sim(LEVELS[i]);
    S.ghosts = [];
    S.totalFrames = 0;
    S.screen = 'play';
    S.fade = 1;
    hideOverlay();
    Audio.music(S.theme);
    beginLoop();
    banner(`STAGE ${S.stageLabel}`, LEVELS[i].name, 90);
  }

  function beginLoop() {
    S.sim.startLoop(S.ghosts);
    S.history = [];
    S.springFx = {};
    S.state = 'play';
    S.jumpLock = true;
    S.lastTick = -1;
    if (S.ghosts.length > 0) banner(`LOOP ${S.ghosts.length + 1}`, `ゴースト ×${S.ghosts.length}`, 50);
  }

  function startRewind(then) {
    S.totalFrames += S.sim.frame;
    S.state = 'rewind';
    S.anim = 0;
    S.animMax = Math.max(24, Math.min(50, Math.round(S.history.length / 8)));
    S.after = then || beginLoop;
    Audio.play('rewind');
    Audio.duck(1.2);
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

  function retryLoop() {
    toast('このループをやり直し', '#a9a6d6', 60);
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
    startRewind(() => { S.totalFrames = 0; beginLoop(); });
  }

  function handleEvents(ev) {
    for (const e of ev) {
      switch (e.type) {
        case 'jump': Audio.play('jump'); break;
        case 'land': Audio.play('land'); break;
        case 'spring': {
          const cx = Math.floor((e.x + 10) / T), cy = Math.floor((e.y + 28) / T);
          for (const dx of [-1, 0, 1]) {
            if (S.sim.L.tiles[cy] && S.sim.L.tiles[cy][cx + dx] === 'S') S.springFx[cy * 1000 + cx + dx] = 12;
          }
          if (!e.ghost) Audio.play('spring');
          break;
        }
        case 'crumble':
          Audio.play('crumble');
          setTimeout(() => burst(e.x * T + 16, e.y * T + 20, '#a1866f', 10, 2), 600);
          break;
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
    const frames = S.totalFrames + S.sim.frame;
    const i = S.levelIdx;
    const prev = save.best[i];
    const prevTime = save.time[i];
    const bestLoops = prev == null || loops < prev;
    const bestTime = prevTime == null || frames < prevTime;
    if (bestLoops) save.best[i] = loops;
    if (bestTime) save.time[i] = frames;
    writeSave();
    Audio.play('clear');
    const p = S.sim.player;
    burst(p.x + 10, p.y + 14, '#8ce99a', 40, 5);
    S.state = 'clear';
    setTimeout(() => showClear(loops, frames, bestLoops && prev != null, bestTime && prevTime != null), 700);
  }

  // ---- 1フレーム更新 ----
  function update() {
    for (const a of Input.takeActions()) onAction(a);

    if (S.banner && S.banner.t > 0) S.banner.t--;
    if (S.toast && S.toast.t > 0) S.toast.t--;
    if (S.shake > 0) S.shake = Math.max(0, S.shake - 0.7);
    if (S.fade > 0) S.fade = Math.max(0, S.fade - 0.05);
    for (const k in S.springFx) if (S.springFx[k] > 0) S.springFx[k]--;
    for (const p of S.particles) { p.x += p.vx; p.y += p.vy; p.vy += 0.12; p.life--; }
    S.particles = S.particles.filter((p) => p.life > 0);

    if (S.screen !== 'play' || !S.sim) return;

    if (S.state === 'play') {
      let bits = Input.bits();
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
      if (S.anim >= S.animMax) { S.totalFrames += S.sim.frame; beginLoop(); }
    }
  }

  function onAction(a) {
    if (a === 'mute') {
      const m = Audio.toggleMute();
      updateMuteButton();
      if (S.screen === 'play') toast(m ? '音：オフ' : '音：オン', '#a9a6d6', 50);
      return;
    }
    if (S.screen === 'play') {
      if (a === 'menu') { if (S.state !== 'clear') showPause(); return; }
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
    if (S.screen === 'pause') {
      if (a === 'menu' || a === 'confirm') resume();
      else if (a === 'rewind') { resume(); retryLoop(); }
      else if (a === 'undo') { resume(); undoLoop(); }
      else if (a === 'restart') { resume(); restartLevel(); }
      return;
    }
    if (a === 'confirm') {
      const primary = overlay.querySelector('[data-primary]');
      if (primary) primary.click();
    } else if (a === 'menu') {
      const back = overlay.querySelector('[data-back]');
      if (back) back.click();
    } else if (a === 'rewind' && S.screen === 'clear') {
      startLevel(S.levelIdx, true);
    }
  }

  function updateMuteButton() {
    const btn = document.querySelector('[data-action="mute"]');
    if (btn) btn.textContent = Audio.isMuted() ? '🔇' : '🔊';
  }

  // ---- 画面（HTMLオーバーレイ） ----
  function hideOverlay() { overlay.classList.add('hidden'); overlay.innerHTML = ''; }
  function showOverlay(html) {
    overlay.innerHTML = html;
    overlay.classList.remove('hidden');
    overlay.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { Audio.unlock(); Audio.play('click'); }));
    const first = overlay.querySelector('[data-primary]');
    if (first) first.focus({ preventScroll: true });
  }
  const on = (sel, fn) => { const el = overlay.querySelector(sel); if (el) el.addEventListener('click', fn); };

  function showTitle() {
    S.screen = 'title';
    Audio.music('title');
    const any = Object.keys(save.best).length > 0;
    showOverlay(`
      <div class="panel title">
        <div class="logo">LOOP<span>ME</span></div>
        <div class="logo-ja">ループ・ミー</div>
        <p class="tagline">10秒ごとに時間が巻き戻る。<br>さっきまでの自分は、今の自分の味方になる。</p>
        <div class="buttons">
          <button class="btn primary" data-primary id="b-start">${any ? 'つづきから' : 'はじめから'}</button>
          <button class="btn" id="b-select">ステージ選択</button>
        </div>
        <ul class="controls">
          <li><kbd>←</kbd><kbd>→</kbd> 移動　<kbd>Space</kbd> ジャンプ　<kbd>R</kbd> 巻き戻し</li>
          <li><kbd>U</kbd> ひとつ前のループを取り消し　<kbd>Esc</kbd> ポーズ</li>
        </ul>
        <p class="progress">${progressText()}</p>
      </div>`);
    on('#b-start', () => {
      Audio.unlock();
      let i = 0;
      while (i < LEVELS.length - 1 && save.best[i] != null) i++;
      startLevel(i);
    });
    on('#b-select', showSelect);
  }

  function progressText() {
    const cleared = Object.keys(save.best).length;
    const perfect = LEVELS.filter((lv, i) => save.best[i] != null && save.best[i] <= lv.par).length;
    return cleared ? `クリア ${cleared} / ${LEVELS.length}　・　パーフェクト ${perfect} / ${LEVELS.length}` : '';
  }

  function showSelect() {
    S.screen = 'select';
    Audio.music('title');
    const sections = WORLDS.map((w, wi) => {
      const cards = [];
      let cleared = 0, perfect = 0;
      for (let i = w.start; i < w.start + w.count; i++) {
        const lv = LEVELS[i];
        const best = save.best[i];
        const open = unlocked(i);
        if (best != null) cleared++;
        if (best != null && best <= lv.par) perfect++;
        const medal = best == null ? '' : best <= lv.par ? '<span class="medal">★ パーフェクト</span>' : '<span class="medal dim">クリア</span>';
        const time = save.time[i] != null ? ` ・ ${Render.fmtTime(save.time[i])}` : '';
        cards.push(`<button class="card ${open ? '' : 'locked'}" ${open ? '' : 'disabled'} data-i="${i}">
            <span class="num">${stageLabel(i)}</span>
            <span class="name">${open ? lv.name : '？？？'}</span>
            <span class="meta">${open ? (best != null ? `ベスト ${best} ループ${time}` : `目標 ${lv.par} ループ`) : 'ロック中'}</span>
            ${medal}
          </button>`);
      }
      return `<section class="world ${w.theme}">
          <div class="world-head"><h3>WORLD ${wi + 1}　${w.name}</h3><span>クリア ${cleared}/${w.count} ・ パーフェクト ${perfect}/${w.count}</span></div>
          <div class="grid">${cards.join('')}</div>
        </section>`;
    }).join('');
    showOverlay(`
      <div class="panel select">
        <h2>ステージ選択</h2>
        ${sections}
        <div class="buttons">
          ${save.ending ? '<button class="btn" id="b-ending">エンディングを見る</button>' : ''}
          <button class="btn" data-back id="b-back">タイトルへ</button>
        </div>
      </div>`);
    overlay.querySelectorAll('.card:not(.locked)').forEach((b) => b.addEventListener('click', () => startLevel(Number(b.dataset.i))));
    on('#b-back', showTitle);
    on('#b-ending', showEnding);
    const cards = overlay.querySelectorAll('.card:not(.locked)');
    const last = cards[cards.length - 1];
    if (last) { last.setAttribute('data-primary', ''); last.focus({ preventScroll: true }); }
  }

  function showPause() {
    S.screen = 'pause';
    const p = Audio.prefs;
    showOverlay(`
      <div class="panel pause">
        <h2>ポーズ</h2>
        <p class="tagline">STAGE ${S.stageLabel}「${S.sim.def.name}」　ループ ${S.ghosts.length + 1} / ${S.sim.def.maxLoops}</p>
        <div class="menu-list">
          <button class="btn primary" data-primary id="p-resume">つづける <kbd>Esc</kbd></button>
          <button class="btn" id="p-retry">このループをやり直す <kbd>R</kbd></button>
          <button class="btn" id="p-undo" ${S.ghosts.length ? '' : 'disabled'}>ひとつ前のループを取り消す <kbd>U</kbd></button>
          <button class="btn" id="p-restart">ステージを最初から <kbd>X</kbd></button>
          <button class="btn" id="p-select">ステージ選択へ</button>
        </div>
        <div class="toggles">
          <label><input type="checkbox" id="opt-music" ${p.music ? 'checked' : ''}> BGM</label>
          <label><input type="checkbox" id="opt-sfx" ${p.sfx ? 'checked' : ''}> 効果音</label>
        </div>
      </div>`);
    on('#p-resume', resume);
    on('#p-retry', () => { resume(); retryLoop(); });
    on('#p-undo', () => { resume(); undoLoop(); });
    on('#p-restart', () => { resume(); restartLevel(); });
    on('#p-select', showSelect);
    overlay.querySelector('#opt-music').addEventListener('change', (e) => Audio.setOption('music', e.target.checked));
    overlay.querySelector('#opt-sfx').addEventListener('change', (e) => Audio.setOption('sfx', e.target.checked));
  }

  function resume() { S.screen = 'play'; hideOverlay(); }

  function showClear(loops, frames, newBestLoops, newBestTime) {
    S.screen = 'clear';
    const i = S.levelIdx;
    const lv = LEVELS[i];
    const last = i === LEVELS.length - 1;
    const w = worldOf(i);
    const worldEnd = i === WORLDS[w].start + WORLDS[w].count - 1;
    const perfect = loops <= lv.par;
    const nextLabel = last ? 'エンディングへ' : worldEnd ? '次のワールドへ' : '次のステージ';
    showOverlay(`
      <div class="panel clear">
        <h2>${worldEnd ? `WORLD ${w + 1} CLEAR!` : 'STAGE CLEAR!'}</h2>
        <div class="result">
          <div class="stats">
            <div><span class="big">${loops}</span><span class="unit">ループ</span><span class="cap">目標 ${lv.par}${newBestLoops ? '・<b>ベスト更新</b>' : ''}</span></div>
            <div><span class="big time">${Render.fmtTime(frames)}</span><span class="cap">タイム${newBestTime ? '・<b>ベスト更新</b>' : save.time[i] != null && save.time[i] !== frames ? `（ベスト ${Render.fmtTime(save.time[i])}）` : ''}</span></div>
          </div>
          <div class="rank ${perfect ? 'perfect' : ''}">${perfect ? '★ パーフェクト！' : 'もっと少ないループで行けるかも？'}</div>
        </div>
        <div class="buttons">
          <button class="btn primary" data-primary id="b-next">${nextLabel}</button>
          <button class="btn" id="b-retry">もう一度 <kbd>R</kbd></button>
          <button class="btn" data-back id="b-sel">ステージ選択</button>
        </div>
      </div>`);
    on('#b-next', () => (last ? showEnding() : startLevel(i + 1)));
    on('#b-retry', () => startLevel(i, true));
    on('#b-sel', showSelect);
  }

  function showStory(title, kicker, lines, button, then) {
    S.screen = 'story';
    showOverlay(`
      <div class="panel story">
        <div class="kicker">${kicker}</div>
        <h2>${title}</h2>
        <div class="lines">${lines.map((l, k) => `<p style="animation-delay:${0.3 + k * 0.7}s">${l}</p>`).join('')}</div>
        <div class="buttons"><button class="btn primary" data-primary id="b-go">${button}</button></div>
      </div>`);
    on('#b-go', then);
  }

  function showEnding() {
    save.ending = true; writeSave();
    Audio.music('title');
    const perfect = LEVELS.filter((lv, i) => save.best[i] != null && save.best[i] <= lv.par).length;
    showStory('時計は動き出した', 'ENDING', ENDING.concat([`パーフェクト ${perfect} / ${LEVELS.length}`]), 'タイトルへ', showTitle);
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
  updateMuteButton();
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && S.screen === 'play' && S.state === 'play') showPause();
  });

  S.sim = new Sim(LEVELS[0]);
  S.sim.startLoop([]);
  showTitle();
  requestAnimationFrame(frame);

  root.LM.Game = { S, startLevel };
})(window);
