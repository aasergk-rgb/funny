// 描画
(function (root) {
  'use strict';
  const { T } = root.LM;
  const HUD = 32;
  const VIEW_W = 768, VIEW_H = 480;

  const COLOR = {
    bg1: '#141331', bg2: '#221d48',
    wall: '#2d2a5c', wallTop: '#7b6ff0', wallDot: '#36326b',
    player: '#ff9f43', playerDark: '#c96a14',
    door: { A: '#ff6b6b', B: '#4dabf7', C: '#51cf66', D: '#fcc419' },
    star: '#ffe066', gold: '#f5c542', plat: '#c4b5fd', spike: '#cfd4e6',
    text: '#f1f0ff', sub: '#a9a6d6',
  };
  const GHOST = ['#5ce1e6', '#b197fc', '#f783ac', '#8ce99a', '#ffd43b', '#74c0fc'];
  const ghostColor = (i) => GHOST[i % GHOST.length];

  let staticLayer = null;
  let staticFor = null;

  function buildStatic(L) {
    const c = document.createElement('canvas');
    c.width = L.W * T; c.height = L.H * T;
    const g = c.getContext('2d');
    for (let y = 0; y < L.H; y++) {
      for (let x = 0; x < L.W; x++) {
        const t = L.tiles[y][x];
        const px = x * T, py = y * T;
        if (t === '#') {
          g.fillStyle = COLOR.wall;
          g.fillRect(px, py, T, T);
          g.fillStyle = COLOR.wallDot;
          g.fillRect(px + 6, py + 8, 3, 3);
          g.fillRect(px + 20, py + 20, 3, 3);
          const above = y > 0 ? L.tiles[y - 1][x] : '#';
          if (above !== '#') {
            g.fillStyle = COLOR.wallTop;
            g.fillRect(px, py, T, 4);
          }
        } else if (t === '^') {
          g.fillStyle = COLOR.spike;
          for (let i = 0; i < 3; i++) {
            const sx = px + 2 + i * 9.5;
            g.beginPath();
            g.moveTo(sx, py + T);
            g.lineTo(sx + 4.75, py + 16);
            g.lineTo(sx + 9.5, py + T);
            g.closePath();
            g.fill();
          }
        }
      }
    }
    return c;
  }

  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  function starPath(g, cx, cy, r1, r2, rot) {
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? r2 : r1;
      const a = rot + (i * Math.PI) / 5 - Math.PI / 2;
      g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    g.closePath();
  }

  function drawActor(g, x, y, color, facing, opts) {
    const o = opts || {};
    g.save();
    g.globalAlpha = o.alpha == null ? 1 : o.alpha;
    g.fillStyle = color;
    roundRect(g, x, y, 20, 28, 6);
    g.fill();
    if (!o.ghost) {
      g.fillStyle = COLOR.playerDark;
      g.fillRect(x + 2, y + 18, 16, 4); // マフラー
    }
    // 目
    const ex = x + 10 + facing * 3;
    g.fillStyle = '#fff';
    g.fillRect(ex - 6, y + 7, 5, 7);
    g.fillRect(ex + 1, y + 7, 5, 7);
    g.fillStyle = '#1b1838';
    g.fillRect(ex - 5 + facing, y + 9, 3, 4);
    g.fillRect(ex + 2 + facing, y + 9, 3, 4);
    if (o.label) {
      g.globalAlpha = Math.min(1, (o.alpha || 1) + 0.3);
      g.font = 'bold 11px system-ui, sans-serif';
      g.textAlign = 'center';
      g.fillStyle = color;
      g.fillText(o.label, x + 10, y - 4);
    }
    g.restore();
  }

  function drawWorld(g, S, t) {
    const sim = S.sim;
    const L = sim.L;
    if (staticFor !== L) { staticLayer = buildStatic(L); staticFor = L; }

    // 背景
    const grd = g.createLinearGradient(0, 0, 0, L.H * T);
    grd.addColorStop(0, COLOR.bg1);
    grd.addColorStop(1, COLOR.bg2);
    g.fillStyle = grd;
    g.fillRect(0, 0, L.W * T, L.H * T);
    g.strokeStyle = 'rgba(255,255,255,0.03)';
    g.lineWidth = 1;
    for (let x = 0; x <= L.W; x++) { g.beginPath(); g.moveTo(x * T + 0.5, 0); g.lineTo(x * T + 0.5, L.H * T); g.stroke(); }
    for (let y = 0; y <= L.H; y++) { g.beginPath(); g.moveTo(0, y * T + 0.5); g.lineTo(L.W * T, y * T + 0.5); g.stroke(); }

    // ゴーストの軌跡
    S.ghosts.forEach((rec, i) => {
      const pts = rec.pos;
      if (pts.length < 2) return;
      g.save();
      g.strokeStyle = ghostColor(i);
      g.globalAlpha = 0.22;
      g.setLineDash([3, 5]);
      g.lineWidth = 2;
      g.beginPath();
      for (let k = 0; k < pts.length; k += 3) {
        const px = pts[k][0] + 10, py = pts[k][1] + 14;
        if (k === 0) g.moveTo(px, py); else g.lineTo(px, py);
      }
      g.stroke();
      const e = pts[pts.length - 1];
      g.setLineDash([]);
      g.globalAlpha = 0.35;
      g.strokeRect(e[0] + 0.5, e[1] + 0.5, 19, 27);
      g.restore();
    });

    g.drawImage(staticLayer, 0, 0);

    // 扉
    for (const letter in L.doorTiles) {
      const open = sim.doorOpen[letter];
      const col = COLOR.door[letter];
      for (const d of L.doorTiles[letter]) {
        const px = d.x * T, py = d.y * T;
        if (open) {
          g.save();
          g.strokeStyle = col; g.globalAlpha = 0.3; g.setLineDash([4, 4]);
          g.strokeRect(px + 2.5, py + 2.5, T - 5, T - 5);
          g.restore();
        } else {
          g.fillStyle = col;
          g.globalAlpha = 0.9;
          g.fillRect(px + 1, py, T - 2, T);
          g.globalAlpha = 1;
          g.save();
          g.beginPath(); g.rect(px + 1, py, T - 2, T); g.clip();
          g.strokeStyle = 'rgba(0,0,0,0.22)'; g.lineWidth = 4;
          for (let i = -T; i < T * 2; i += 11) {
            g.beginPath(); g.moveTo(px + i, py + T); g.lineTo(px + i + T, py); g.stroke();
          }
          g.restore();
        }
      }
    }

    // スイッチ
    for (const p of L.plates) {
      const on = sim.platePressed(p);
      const col = COLOR.door[p.letter];
      const px = p.x * T, py = (p.y + 1) * T;
      g.fillStyle = '#2a2750';
      g.fillRect(px + 2, py - 4, T - 4, 4);
      g.fillStyle = col;
      if (on) {
        g.save(); g.shadowColor = col; g.shadowBlur = 12;
        g.fillRect(px + 4, py - 4, T - 8, 3);
        g.restore();
      } else {
        g.fillRect(px + 4, py - 9, T - 8, 6);
      }
    }

    // 錠
    for (const lk of L.lockTiles) {
      const px = lk.x * T, py = lk.y * T;
      if (sim.lockOpen) {
        g.save(); g.strokeStyle = COLOR.gold; g.globalAlpha = 0.3; g.setLineDash([4, 4]);
        g.strokeRect(px + 2.5, py + 2.5, T - 5, T - 5); g.restore();
      } else {
        g.fillStyle = COLOR.gold;
        g.fillRect(px + 1, py + 1, T - 2, T - 2);
        g.fillStyle = '#8a6a12';
        g.beginPath(); g.arc(px + 16, py + 13, 4, 0, Math.PI * 2); g.fill();
        g.fillRect(px + 14, py + 14, 4, 9);
      }
    }

    // 鍵
    if (L.key && !sim.keyTaken) {
      const kx = L.key.x * T + 16, ky = L.key.y * T + 16 + Math.sin(t * 4) * 3;
      g.save();
      g.strokeStyle = COLOR.gold; g.fillStyle = COLOR.gold; g.lineWidth = 4;
      g.shadowColor = COLOR.gold; g.shadowBlur = 10;
      g.beginPath(); g.arc(kx - 6, ky, 6, 0, Math.PI * 2); g.stroke();
      g.fillRect(kx - 1, ky - 2, 13, 4);
      g.fillRect(kx + 6, ky + 2, 3, 5);
      g.fillRect(kx + 10, ky + 2, 3, 4);
      g.restore();
    }

    // 星
    for (const s of L.stars) {
      const got = sim.committed.has(s.id) || sim.starsLoop.has(s.id);
      const cx = s.x * T + 16, cy = s.y * T + 16 + (got ? 0 : Math.sin(t * 3 + s.id) * 3);
      g.save();
      if (got) {
        g.strokeStyle = COLOR.star; g.globalAlpha = 0.3; g.lineWidth = 1.5;
        starPath(g, cx, cy, 10, 4.5, 0); g.stroke();
      } else {
        g.fillStyle = COLOR.star; g.shadowColor = COLOR.star; g.shadowBlur = 12;
        starPath(g, cx, cy, 11, 5, Math.sin(t * 2 + s.id) * 0.25); g.fill();
      }
      g.restore();
    }

    // ゴール
    {
      const gl = L.goal;
      const px = gl.x * T, py = gl.y * T;
      const ready = sim.allStars();
      g.save();
      g.fillStyle = ready ? '#2b8a3e' : '#3b3866';
      roundRect(g, px + 3, py - 8, T - 6, T + 8, 10);
      g.fill();
      g.fillStyle = ready ? '#0b1f12' : '#24224a';
      roundRect(g, px + 8, py - 2, T - 16, T + 2, 7);
      g.fill();
      if (ready) {
        g.globalAlpha = 0.5 + Math.sin(t * 5) * 0.3;
        g.strokeStyle = '#8ce99a'; g.lineWidth = 2;
        roundRect(g, px + 3, py - 8, T - 6, T + 8, 10);
        g.stroke();
      } else {
        g.fillStyle = COLOR.sub;
        g.fillRect(px + 12, py + 12, 8, 7);
        g.strokeStyle = COLOR.sub; g.lineWidth = 2;
        g.beginPath(); g.arc(px + 16, py + 12, 3, Math.PI, 0); g.stroke();
      }
      g.restore();
    }

    // 動く床
    for (const p of sim.plats) {
      g.fillStyle = COLOR.plat;
      roundRect(g, p.x, p.y, p.w, p.h, 4); g.fill();
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.fillRect(p.x + 3, p.y + p.h - 3, p.w - 6, 3);
    }
  }

  function drawActors(g, S, positions) {
    const sim = S.sim;
    sim.actors.forEach((a, i) => {
      const pos = positions ? positions[i] : null;
      const x = pos ? pos[0] : a.x, y = pos ? pos[1] : a.y;
      const alive = pos ? pos[2] : a.alive;
      if (!alive) return;
      if (a.ghost) {
        drawActor(g, x, y, ghostColor(a.idx), a.facing, { ghost: true, alpha: 0.55, label: String(a.idx + 1) });
      }
    });
    const p = sim.player;
    const pp = positions ? positions[sim.actors.length - 1] : null;
    if (pp ? pp[2] : p.alive) {
      drawActor(g, pp ? pp[0] : p.x, pp ? pp[1] : p.y, COLOR.player, p.facing, { label: positions ? '' : 'YOU' });
    }
  }

  function drawParticles(g, parts) {
    for (const p of parts) {
      g.globalAlpha = Math.max(0, p.life / p.max);
      g.fillStyle = p.color;
      g.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    g.globalAlpha = 1;
  }

  function drawHUD(g, S, t) {
    const sim = S.sim;
    const def = sim.def;
    g.fillStyle = '#0e0d24';
    g.fillRect(0, 0, VIEW_W, HUD);
    g.font = 'bold 14px system-ui, sans-serif';
    g.textBaseline = 'middle';
    g.textAlign = 'left';
    g.fillStyle = COLOR.sub;
    g.fillText(`STAGE ${S.levelIdx + 1}`, 12, HUD / 2);
    g.fillStyle = COLOR.text;
    g.fillText(def.name, 88, HUD / 2);

    // ループ数
    const loopNo = S.ghosts.length + 1;
    g.textAlign = 'center';
    g.fillStyle = COLOR.sub;
    g.fillText('LOOP', 430, HUD / 2);
    for (let i = 0; i < def.maxLoops; i++) {
      const x = 470 + i * 16;
      g.beginPath();
      g.arc(x, HUD / 2, 5, 0, Math.PI * 2);
      if (i < loopNo - 1) { g.fillStyle = ghostColor(i); g.fill(); }
      else if (i === loopNo - 1) { g.fillStyle = COLOR.player; g.fill(); }
      else { g.strokeStyle = '#4a4680'; g.lineWidth = 1.5; g.stroke(); }
    }

    // 星
    const total = sim.L.stars.length;
    const got = sim.L.stars.filter((s) => sim.committed.has(s.id) || sim.starsLoop.has(s.id)).length;
    g.textAlign = 'right';
    g.fillStyle = got === total ? '#8ce99a' : COLOR.star;
    g.fillText(`★ ${got} / ${total}`, VIEW_W - 12, HUD / 2);

    // タイマー
    const remain = Math.max(0, sim.loopFrames - sim.frame);
    const ratio = remain / sim.loopFrames;
    const secs = remain / 60;
    let col = '#69db7c';
    if (secs < 3) col = (Math.floor(t * 6) % 2) ? '#ff6b6b' : '#ffa8a8';
    else if (ratio < 0.5) col = '#ffd43b';
    g.fillStyle = '#26234d';
    g.fillRect(0, HUD - 4, VIEW_W, 4);
    g.fillStyle = col;
    g.fillRect(0, HUD - 4, VIEW_W * ratio, 4);
    g.textAlign = 'center';
    g.fillStyle = secs < 3 ? col : COLOR.text;
    g.font = 'bold 13px ui-monospace, monospace';
    g.fillText(secs.toFixed(1) + 's', 600, HUD / 2);
  }

  function drawBanner(g, text, sub, alpha) {
    g.save();
    g.globalAlpha = alpha;
    g.fillStyle = 'rgba(10,9,30,0.6)';
    g.fillRect(0, HUD + 170, VIEW_W, 76);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = COLOR.text;
    g.font = 'bold 30px system-ui, sans-serif';
    g.fillText(text, VIEW_W / 2, HUD + 198);
    if (sub) {
      g.font = '14px system-ui, sans-serif';
      g.fillStyle = COLOR.sub;
      g.fillText(sub, VIEW_W / 2, HUD + 228);
    }
    g.restore();
  }

  function render(g, S, t) {
    g.save();
    g.clearRect(0, 0, VIEW_W, VIEW_H);
    if (!S.sim) { g.restore(); return; }
    const sx = S.shake > 0 ? (Math.random() - 0.5) * S.shake : 0;
    const sy = S.shake > 0 ? (Math.random() - 0.5) * S.shake : 0;
    g.save();
    g.translate(sx, HUD + sy);
    drawWorld(g, S, t);

    let positions = null;
    if (S.state === 'rewind' && S.history.length) {
      const k = Math.min(1, S.anim / S.animMax);
      const idx = Math.floor((1 - k) * (S.history.length - 1));
      positions = S.history[idx];
    }
    drawActors(g, S, positions);
    drawParticles(g, S.particles);

    // ヒント
    if (S.sim.def.hint && S.state !== 'rewind') {
      g.save();
      g.font = '13px system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      const w = Math.min(VIEW_W - 24, g.measureText(S.sim.def.hint).width + 24);
      g.fillStyle = 'rgba(8,7,26,0.78)';
      roundRect(g, (VIEW_W - w) / 2, 13 * T + 4, w, 24, 8); g.fill();
      g.fillStyle = COLOR.sub;
      g.fillText(S.sim.def.hint, VIEW_W / 2, 13 * T + 16.5);
      g.restore();
    }
    g.restore();

    if (S.state === 'rewind') {
      // 逆再生エフェクト
      g.save();
      g.fillStyle = 'rgba(92,225,230,0.08)';
      g.fillRect(0, HUD, VIEW_W, VIEW_H - HUD);
      g.globalAlpha = 0.12;
      g.fillStyle = '#000';
      const off = (t * 300) % 6;
      for (let y = HUD + off; y < VIEW_H; y += 6) g.fillRect(0, y, VIEW_W, 2);
      g.globalAlpha = 1;
      g.font = 'bold 26px system-ui, sans-serif';
      g.textAlign = 'left'; g.textBaseline = 'top';
      g.fillStyle = '#5ce1e6';
      g.fillText('◀◀ REWIND', 20, HUD + 14);
      g.restore();
    }

    drawHUD(g, S, t);

    if (S.banner && S.banner.t > 0) {
      const a = Math.min(1, S.banner.t / 20);
      drawBanner(g, S.banner.text, S.banner.sub, a);
    }
    if (S.toast && S.toast.t > 0) {
      g.save();
      g.globalAlpha = Math.min(1, S.toast.t / 20);
      g.font = 'bold 16px system-ui, sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      const w = g.measureText(S.toast.text).width + 32;
      g.fillStyle = S.toast.color || '#f783ac';
      roundRect(g, (VIEW_W - w) / 2, HUD + 52, w, 32, 16); g.fill();
      g.fillStyle = '#16142f';
      g.fillText(S.toast.text, VIEW_W / 2, HUD + 68);
      g.restore();
    }
    g.restore();
  }

  root.LM.Render = { render, VIEW_W, VIEW_H, HUD, ghostColor, COLOR };
})(window);
