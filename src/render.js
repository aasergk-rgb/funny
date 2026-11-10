// 描画
(function (root) {
  'use strict';
  const { T, PHY } = root.LM;
  const HUD = 32;
  const VIEW_W = 768, VIEW_H = 480;

  const BASE = {
    player: '#ff9f43', playerDark: '#c96a14',
    door: { A: '#ff6b6b', B: '#4dabf7', C: '#51cf66', D: '#fcc419', E: '#3bc9db', T: '#f06595' },
    portal: { 1: '#cc5de8', 2: '#22b8cf', 3: '#94d82d', 4: '#ff922b' }, enemy: '#fa5252',
    star: '#ffe066', gold: '#f5c542', plat: '#c4b5fd', spike: '#cfd4e6',
    text: '#f1f0ff', sub: '#a9a6d6', spring: '#ff6b6b',
  };
  // ワールドごとの配色
  const THEMES = {
    night: {
      bg1: '#141331', bg2: '#221d48', wall: '#2d2a5c', wallTop: '#7b6ff0', wallDot: '#36326b',
      deco: 'rgba(160,150,255,0.07)', plank: '#9d8cff', crumble: '#5a4f8f',
    },
    rift: {
      bg1: '#0b1622', bg2: '#1c0f2e', wall: '#1d2b42', wallTop: '#22d3ee', wallDot: '#26385a',
      deco: 'rgba(120,230,255,0.08)', plank: '#22d3ee', crumble: '#3a4d6a',
    },
    factory: {
      bg1: '#19130f', bg2: '#2b2016', wall: '#3b2f25', wallTop: '#e8a33d', wallDot: '#4a3b2e',
      deco: 'rgba(255,190,110,0.07)', plank: '#e8a33d', crumble: '#7a5a3a',
    },
  };
  const COLOR = Object.assign({}, BASE, THEMES.night);
  const GHOST = ['#5ce1e6', '#b197fc', '#f783ac', '#8ce99a', '#ffd43b', '#74c0fc'];
  const ghostColor = (i) => GHOST[i % GHOST.length];

  let staticLayer = null;
  let staticKey = null;

  function setTheme(name) { Object.assign(COLOR, THEMES[name] || THEMES.night); }

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
        } else if (t === '-') {
          g.fillStyle = COLOR.plank;
          g.fillRect(px, py, T, 5);
          g.fillStyle = 'rgba(0,0,0,0.3)';
          g.fillRect(px, py + 5, T, 2);
          g.fillStyle = COLOR.plank;
          g.globalAlpha = 0.35;
          g.fillRect(px + 4, py + 7, 2, 6);
          g.fillRect(px + T - 6, py + 7, 2, 6);
          g.globalAlpha = 1;
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

  function gear(g, cx, cy, r, teeth, rot) {
    g.beginPath();
    for (let i = 0; i < teeth * 2; i++) {
      const a = rot + (i * Math.PI) / teeth;
      const rr = i % 2 ? r : r * 0.84;
      g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
      g.lineTo(cx + Math.cos(a + Math.PI / teeth) * rr, cy + Math.sin(a + Math.PI / teeth) * rr);
    }
    g.closePath();
    g.fill();
    g.save();
    g.globalCompositeOperation = 'destination-out';
    g.beginPath(); g.arc(cx, cy, r * 0.35, 0, Math.PI * 2); g.fill();
    g.restore();
  }

  // 背景（ワールドごと）。時計の針は、このループの残り時間を指す
  function drawBackdrop(g, S, t, W, H) {
    const sim = S.sim;
    const grd = g.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, COLOR.bg1);
    grd.addColorStop(1, COLOR.bg2);
    g.fillStyle = grd;
    g.fillRect(0, 0, W, H);
    const prog = sim.frame / sim.loopFrames;
    g.save();
    g.fillStyle = COLOR.deco;
    g.strokeStyle = COLOR.deco;
    if (S.theme === 'rift') {
      // 時の裂け目：光る亀裂と、漂う光
      g.lineWidth = 3;
      g.strokeStyle = 'rgba(240,101,149,0.18)';
      g.beginPath();
      const pts = [[80, 0], [140, 90], [110, 170], [210, 260], [180, 340], [260, H]];
      pts.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.stroke();
      g.strokeStyle = 'rgba(34,211,238,0.14)';
      g.beginPath();
      const pts2 = [[W - 120, 0], [W - 200, 120], [W - 150, 220], [W - 260, 330], [W - 230, H]];
      pts2.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.stroke();
      for (let i = 0; i < 30; i++) {
        const x = (i * 131 + t * 12 * (1 + (i % 3))) % W;
        const y = (i * 71 - t * 8 * (1 + (i % 2)) + H * 4) % H;
        g.globalAlpha = 0.35;
        g.fillStyle = i % 2 ? '#22d3ee' : '#f06595';
        g.fillRect(x, y, 2, 2);
      }
      g.globalAlpha = 1;
    } else if (S.theme === 'factory') {
      gear(g, 150, 150, 110, 12, t * 0.2);
      gear(g, 300, 260, 70, 9, -t * 0.34 + 0.2);
      gear(g, 640, 120, 90, 11, -t * 0.25);
      g.lineWidth = 14;
      g.beginPath(); g.moveTo(0, 360); g.lineTo(W, 360); g.stroke();
      g.lineWidth = 8;
      g.beginPath(); g.moveTo(520, 0); g.lineTo(520, 360); g.stroke();
    } else {
      // 星空
      for (let i = 0; i < 40; i++) {
        const sx = (i * 197) % W, sy = (i * 83) % (H * 0.7);
        g.globalAlpha = 0.25 + 0.25 * Math.sin(t * 1.5 + i);
        g.fillStyle = '#c9c4ff';
        g.fillRect(sx, sy, 2, 2);
      }
      g.globalAlpha = 1;
      g.fillStyle = COLOR.deco;
      // 大きな時計
      const cx = 560, cy = 170, r = 120;
      g.lineWidth = 6;
      g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        g.fillRect(cx + Math.cos(a) * (r - 16) - 3, cy + Math.sin(a) * (r - 16) - 3, 6, 6);
      }
      g.lineWidth = 8;
      const ha = -Math.PI / 2 + prog * Math.PI * 2;
      g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(ha) * (r - 30), cy + Math.sin(ha) * (r - 30)); g.stroke();
      g.lineWidth = 5;
      const ma = -Math.PI / 2 + prog * Math.PI * 24;
      g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(ma) * (r - 50), cy + Math.sin(ma) * (r - 50)); g.stroke();
    }
    g.restore();
    g.strokeStyle = 'rgba(255,255,255,0.025)';
    g.lineWidth = 1;
    for (let x = 0; x <= W; x += T) { g.beginPath(); g.moveTo(x + 0.5, 0); g.lineTo(x + 0.5, H); g.stroke(); }
    for (let y = 0; y <= H; y += T) { g.beginPath(); g.moveTo(0, y + 0.5); g.lineTo(W, y + 0.5); g.stroke(); }
  }

  // キャラクター。squash/stretch・歩きの揺れ・まばたき付き
  function drawActor(g, x, y, color, facing, opts) {
    const o = opts || {};
    const sx = o.sx || 1, sy = o.sy || 1;
    g.save();
    g.globalAlpha = o.alpha == null ? 1 : o.alpha;
    g.translate(x + 10, y + 28 + (o.bob || 0));
    g.scale(sx, sy);
    g.translate(-10, -28);
    g.fillStyle = color;
    roundRect(g, 0, 0, 20, 28, 6);
    g.fill();
    if (!o.ghost) {
      g.fillStyle = BASE.playerDark;
      g.fillRect(2, 18, 16, 4); // マフラー
      g.fillRect(facing > 0 ? -3 : 18, 18 + Math.sin((o.time || 0) * 10) * 1.5, 5, 3);
    }
    const ex = 10 + facing * 3;
    const eh = o.blink ? 1 : 7;
    g.fillStyle = '#fff';
    g.fillRect(ex - 6, 7 + (7 - eh) / 2, 5, eh);
    g.fillRect(ex + 1, 7 + (7 - eh) / 2, 5, eh);
    if (!o.blink) {
      g.fillStyle = '#1b1838';
      g.fillRect(ex - 5 + facing, 9, 3, 4);
      g.fillRect(ex + 2 + facing, 9, 3, 4);
    }
    g.restore();
    if (o.label) {
      g.save();
      g.globalAlpha = Math.min(1, (o.alpha || 1) + 0.3);
      g.font = 'bold 11px system-ui, sans-serif';
      g.textAlign = 'center';
      g.fillStyle = color;
      g.fillText(o.label, x + 10, y - 5);
      g.restore();
    }
  }

  // キャラの動きの状態（ループごとにリセット）
  const anim = [];
  function animFor(a, sim) {
    let st = anim[a.idx];
    if (!st || st.loopStart !== sim.loopId) {
      st = anim[a.idx] = { loopStart: sim.loopId, land: 0, air: false, blinkAt: 60 + a.idx * 37 };
    }
    if (st.lastFrame !== sim.frame) {
      st.lastFrame = sim.frame;
      if (st.air && a.onGround) st.land = 8;
      st.air = !a.onGround;
      if (st.land > 0) st.land--;
    }
    let sx = 1, sy = 1, bob = 0;
    if (!a.onGround) {
      const k = Math.min(0.22, Math.abs(a.vy) * 0.018);
      sy = 1 + k; sx = 1 - k * 0.6;
    } else if (st.land > 0) {
      sy = 1 - st.land * 0.025; sx = 1 + st.land * 0.025;
    } else if (Math.abs(a.vx) > 0.5) {
      bob = -Math.abs(Math.sin(sim.frame * 0.35)) * 2;
    }
    const blink = (sim.frame + st.blinkAt) % 200 < 6;
    return { sx, sy, bob, blink };
  }

  function drawTiles(g, S, t) {
    const sim = S.sim;
    const L = sim.L;

    // 扉・かけ橋
    for (const letter in L.doorTiles) {
      const bridge = letter === 'E';
      const solid = bridge ? sim.doorOpen[letter] : !sim.doorOpen[letter];
      const col = BASE.door[letter];
      for (const d of L.doorTiles[letter]) {
        const px = d.x * T, py = d.y * T;
        if (!solid) {
          g.save();
          g.strokeStyle = col; g.globalAlpha = 0.3; g.setLineDash([4, 4]);
          if (bridge) { g.beginPath(); g.moveTo(px, py + 2.5); g.lineTo(px + T, py + 2.5); g.stroke(); }
          else g.strokeRect(px + 2.5, py + 2.5, T - 5, T - 5);
          g.restore();
        } else if (bridge) {
          g.save();
          g.fillStyle = col; g.shadowColor = col; g.shadowBlur = 10;
          g.fillRect(px, py, T, 8);
          g.globalAlpha = 0.35;
          g.fillRect(px + 2, py + 8, T - 4, T - 10);
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
      const col = BASE.door[p.letter];
      const px = p.x * T, py = (p.y + 1) * T;
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.fillRect(px + 2, py - 4, T - 4, 4);
      g.fillStyle = col;
      if (on) {
        g.save(); g.shadowColor = col; g.shadowBlur = 12;
        g.fillRect(px + 4, py - 4, T - 8, 3);
        g.restore();
      } else {
        g.fillRect(px + 4, py - 9, T - 8, 6);
      }
      if (p.timer) {
        // 時計のマーク
        g.strokeStyle = col; g.lineWidth = 1.5;
        g.beginPath(); g.arc(px + 16, py - 19, 5, 0, Math.PI * 2); g.stroke();
        g.beginPath(); g.moveTo(px + 16, py - 19); g.lineTo(px + 16, py - 22); g.moveTo(px + 16, py - 19); g.lineTo(px + 18.5, py - 19); g.stroke();
      }
    }

    // 時限扉の残り時間
    if (L.doorTiles.T && sim.doorOpen.T) {
      const top = L.doorTiles.T.reduce((m, d) => (d.y < m.y ? d : m), L.doorTiles.T[0]);
      const k = sim.timerT / PHY.timer;
      g.fillStyle = 'rgba(0,0,0,0.4)';
      g.fillRect(top.x * T + 2, top.y * T - 8, T - 4, 4);
      g.fillStyle = BASE.door.T;
      g.fillRect(top.x * T + 2, top.y * T - 8, (T - 4) * k, 4);
    }

    // ワープ
    for (const d in L.portals) {
      const col = BASE.portal[d];
      for (const p of L.portals[d]) {
        const cx = p.x * T + 16, cy = p.y * T + 15;
        g.save();
        g.strokeStyle = col; g.lineWidth = 2.5; g.shadowColor = col; g.shadowBlur = 10;
        for (let r = 0; r < 3; r++) {
          const a0 = t * (2.5 + r) + r * 2;
          g.globalAlpha = 0.9 - r * 0.25;
          g.beginPath(); g.ellipse(cx, cy, 13 - r * 4, 15 - r * 4, 0, a0, a0 + Math.PI * 1.3); g.stroke();
        }
        g.globalAlpha = 0.8; g.fillStyle = col; g.shadowBlur = 0;
        g.font = 'bold 9px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(d, cx, cy + 1);
        g.restore();
      }
    }

    // 敵
    for (const e of sim.enemies) {
      if (!e.alive) continue;
      const wob = Math.sin(sim.frame * 0.3) * 1.5;
      g.save();
      g.fillStyle = BASE.enemy;
      g.beginPath();
      g.moveTo(e.x, e.y + e.h);
      for (let i = 0; i <= 4; i++) g.lineTo(e.x + (e.w * i) / 4, e.y + (i % 2 ? -3 : 3) + wob * (i % 2 ? 1 : 0));
      g.lineTo(e.x + e.w, e.y + e.h);
      g.closePath();
      g.fill();
      roundRect(g, e.x, e.y + 3, e.w, e.h - 3, 6); g.fill();
      const ex = e.x + e.w / 2 + e.dir * 4;
      g.fillStyle = '#fff';
      g.fillRect(ex - 6, e.y + 7, 5, 5); g.fillRect(ex + 1, e.y + 7, 5, 5);
      g.fillStyle = '#1b1838';
      g.fillRect(ex - 5 + e.dir, e.y + 9, 3, 3); g.fillRect(ex + 2 + e.dir, e.y + 9, 3, 3);
      g.restore();
    }

    // ジャンプ台・くずれる床
    for (let y = 0; y < L.H; y++) {
      for (let x = 0; x < L.W; x++) {
        const c = L.tiles[y][x];
        const px = x * T, py = y * T;
        if (c === 'S') {
          const k = y * 1000 + x;
          const fx = S.springFx[k] || 0;
          const press = fx > 0 ? Math.sin((fx / 12) * Math.PI) * 8 : 0;
          g.fillStyle = '#4a4e69';
          g.fillRect(px + 2, py + T - 6, T - 4, 6);
          g.strokeStyle = '#c9cede'; g.lineWidth = 3;
          g.beginPath();
          const top = py + 8 + press, bottom = py + T - 6;
          for (let i = 0; i <= 4; i++) {
            const yy = top + ((bottom - top) * i) / 4;
            g.lineTo(px + (i % 2 ? 8 : T - 8), yy);
          }
          g.stroke();
          g.fillStyle = BASE.spring;
          roundRect(g, px + 1, top - 6, T - 2, 7, 3); g.fill();
        } else if (c === '~') {
          const at = sim.crumbleAt[y * 1000 + x];
          const gone = sim.crumbled(x, y);
          if (gone) {
            g.save(); g.strokeStyle = COLOR.crumble; g.globalAlpha = 0.25; g.setLineDash([3, 5]);
            g.strokeRect(px + 2.5, py + 2.5, T - 5, T - 5); g.restore();
            continue;
          }
          let ox = 0;
          if (at !== undefined) {
            const k = (sim.frame - at) / PHY.crumble;
            ox = Math.sin(sim.frame * 2.1 + x) * 2.2 * k;
          }
          g.fillStyle = COLOR.crumble;
          g.fillRect(px + 1 + ox, py, T - 2, T - 4);
          g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = 1.5;
          g.beginPath();
          g.moveTo(px + 6 + ox, py + 2); g.lineTo(px + 13 + ox, py + 12); g.lineTo(px + 9 + ox, py + 22);
          g.moveTo(px + 13 + ox, py + 12); g.lineTo(px + 24 + ox, py + 16);
          g.stroke();
          g.fillStyle = COLOR.wallTop;
          g.globalAlpha = 0.6;
          g.fillRect(px + 1 + ox, py, T - 2, 3);
          g.globalAlpha = 1;
        }
      }
    }

    // 錠
    for (const lk of L.lockTiles) {
      const px = lk.x * T, py = lk.y * T;
      if (sim.lockOpen) {
        g.save(); g.strokeStyle = BASE.gold; g.globalAlpha = 0.3; g.setLineDash([4, 4]);
        g.strokeRect(px + 2.5, py + 2.5, T - 5, T - 5); g.restore();
      } else {
        g.fillStyle = BASE.gold;
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
      g.strokeStyle = BASE.gold; g.fillStyle = BASE.gold; g.lineWidth = 4;
      g.shadowColor = BASE.gold; g.shadowBlur = 10;
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
        g.strokeStyle = BASE.star; g.globalAlpha = 0.3; g.lineWidth = 1.5;
        starPath(g, cx, cy, 10, 4.5, 0); g.stroke();
      } else {
        g.fillStyle = BASE.star; g.shadowColor = BASE.star; g.shadowBlur = 12;
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
        g.fillStyle = BASE.sub;
        g.fillRect(px + 12, py + 12, 8, 7);
        g.strokeStyle = BASE.sub; g.lineWidth = 2;
        g.beginPath(); g.arc(px + 16, py + 12, 3, Math.PI, 0); g.stroke();
      }
      g.restore();
    }

    // 動く床
    for (const p of sim.plats) {
      g.fillStyle = BASE.plat;
      roundRect(g, p.x, p.y, p.w, p.h, 4); g.fill();
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.fillRect(p.x + 3, p.y + p.h - 3, p.w - 6, 3);
    }
  }

  function drawGhostPaths(g, S) {
    S.ghosts.forEach((rec, i) => {
      const pts = rec.pos;
      if (pts.length < 2) return;
      g.save();
      g.strokeStyle = ghostColor(i);
      g.globalAlpha = 0.2;
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
  }

  function drawActors(g, S, positions, t) {
    const sim = S.sim;
    const H = S.history;
    sim.actors.forEach((a, i) => {
      if (!a.ghost) return;
      const pos = positions ? positions[i] : null;
      const x = pos ? pos[0] : a.x, y = pos ? pos[1] : a.y;
      const alive = pos ? pos[2] : a.alive;
      if (!alive) return;
      const col = ghostColor(a.idx);
      if (!positions && H.length > 8) {
        // 残像
        for (const back of [8, 4]) {
          const hp = H[H.length - back][i];
          if (hp && hp[2] && (Math.abs(hp[0] - x) > 2 || Math.abs(hp[1] - y) > 2)) {
            drawActor(g, hp[0], hp[1], col, a.facing, { ghost: true, alpha: back === 8 ? 0.08 : 0.15 });
          }
        }
      }
      const an = positions ? {} : animFor(a, sim);
      drawActor(g, x, y, col, a.facing, Object.assign({ ghost: true, alpha: 0.6, label: String(a.idx + 1), time: t }, an));
    });
    const p = sim.player;
    const pp = positions ? positions[sim.actors.length - 1] : null;
    if (pp ? pp[2] : p.alive) {
      const an = positions ? {} : animFor(p, sim);
      drawActor(g, pp ? pp[0] : p.x, pp ? pp[1] : p.y, BASE.player, p.facing,
        Object.assign({ label: positions ? '' : 'YOU', time: t }, an));
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

  function fmtTime(frames) {
    const s = frames / 60;
    const m = Math.floor(s / 60);
    return `${m}:${(s - m * 60).toFixed(2).padStart(5, '0')}`;
  }

  function drawHUD(g, S, t) {
    const sim = S.sim;
    const def = sim.def;
    g.fillStyle = '#0c0b1f';
    g.fillRect(0, 0, VIEW_W, HUD);
    g.font = 'bold 14px system-ui, sans-serif';
    g.textBaseline = 'middle';
    g.textAlign = 'left';
    g.fillStyle = BASE.sub;
    g.fillText(S.stageLabel || '', 12, HUD / 2);
    g.fillStyle = BASE.text;
    g.fillText(def.name, 52, HUD / 2);

    const loopNo = S.ghosts.length + 1;
    g.textAlign = 'center';
    g.fillStyle = BASE.sub;
    g.fillText('LOOP', 400, HUD / 2);
    for (let i = 0; i < def.maxLoops; i++) {
      const x = 438 + i * 15;
      g.beginPath();
      g.arc(x, HUD / 2, 5, 0, Math.PI * 2);
      if (i < loopNo - 1) { g.fillStyle = ghostColor(i); g.fill(); }
      else if (i === loopNo - 1) { g.fillStyle = BASE.player; g.fill(); }
      else { g.strokeStyle = '#4a4680'; g.lineWidth = 1.5; g.stroke(); }
    }

    const total = sim.L.stars.length;
    const got = sim.L.stars.filter((s) => sim.committed.has(s.id) || sim.starsLoop.has(s.id)).length;
    g.textAlign = 'right';
    g.fillStyle = got === total ? '#8ce99a' : BASE.star;
    g.fillText(`★ ${got}/${total}`, VIEW_W - 12, HUD / 2);

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
    g.fillStyle = secs < 3 ? col : BASE.text;
    g.font = 'bold 13px ui-monospace, monospace';
    g.fillText(secs.toFixed(1) + 's', 572, HUD / 2);
    g.fillStyle = BASE.sub;
    g.font = '12px ui-monospace, monospace';
    g.fillText(fmtTime(S.totalFrames + sim.frame), 652, HUD / 2);
  }

  function drawEditorHUD(g, S) {
    g.fillStyle = '#0c0b1f';
    g.fillRect(0, 0, VIEW_W, HUD);
    g.font = 'bold 14px system-ui, sans-serif';
    g.textBaseline = 'middle';
    g.textAlign = 'left';
    g.fillStyle = '#22d3ee';
    g.fillText('ステージエディタ', 12, HUD / 2);
    g.fillStyle = BASE.text;
    g.fillText(S.sim.def.name || '', 140, HUD / 2);
    g.textAlign = 'right';
    g.fillStyle = BASE.sub;
    g.fillText('クリック／ドラッグで置く・右クリックで消す', VIEW_W - 12, HUD / 2);
  }

  function drawBanner(g, text, sub, alpha) {
    g.save();
    g.globalAlpha = alpha;
    g.fillStyle = 'rgba(10,9,30,0.6)';
    g.fillRect(0, HUD + 170, VIEW_W, 76);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = BASE.text;
    g.font = 'bold 30px system-ui, sans-serif';
    g.fillText(text, VIEW_W / 2, HUD + 198);
    if (sub) {
      g.font = '14px system-ui, sans-serif';
      g.fillStyle = BASE.sub;
      g.fillText(sub, VIEW_W / 2, HUD + 228);
    }
    g.restore();
  }

  function render(g, S, t) {
    g.save();
    g.clearRect(0, 0, VIEW_W, VIEW_H);
    if (!S.sim) { g.restore(); return; }
    setTheme(S.theme);
    const L = S.sim.L;
    const key = L.def.map.join('') + S.theme;
    if (staticKey !== key) { staticLayer = buildStatic(L); staticKey = key; }

    const sx = S.shake > 0 ? (Math.random() - 0.5) * S.shake : 0;
    const sy = S.shake > 0 ? (Math.random() - 0.5) * S.shake : 0;
    g.save();
    g.translate(sx, HUD + sy);
    drawBackdrop(g, S, t, L.W * T, L.H * T);
    drawGhostPaths(g, S);
    g.drawImage(staticLayer, 0, 0);
    drawTiles(g, S, t);

    let positions = null;
    if (S.state === 'rewind' && S.history.length) {
      const k = Math.min(1, S.anim / S.animMax);
      const idx = Math.floor((1 - k) * (S.history.length - 1));
      positions = S.history[idx];
    }
    if (S.screen !== 'title' && S.screen !== 'editor') drawActors(g, S, positions, t);
    if (S.screen === 'editor' && S.drawEditor) S.drawEditor(g, t);
    drawParticles(g, S.particles);

    if (S.sim.def.hint && S.state !== 'rewind' && S.screen === 'play') {
      g.save();
      g.font = '13px system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      const w = Math.min(VIEW_W - 24, g.measureText(S.sim.def.hint).width + 24);
      g.fillStyle = 'rgba(8,7,26,0.8)';
      roundRect(g, (VIEW_W - w) / 2, 13 * T + 4, w, 24, 8); g.fill();
      g.fillStyle = BASE.sub;
      g.fillText(S.sim.def.hint, VIEW_W / 2, 13 * T + 16.5);
      g.restore();
    }
    g.restore();

    if (S.state === 'rewind') {
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

    if (S.screen === 'editor') drawEditorHUD(g, S); else drawHUD(g, S, t);

    if (S.banner && S.banner.t > 0) drawBanner(g, S.banner.text, S.banner.sub, Math.min(1, S.banner.t / 20));
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
    if (S.fade > 0) {
      g.fillStyle = `rgba(6,5,18,${Math.min(1, S.fade)})`;
      g.fillRect(0, 0, VIEW_W, VIEW_H);
    }
    g.restore();
  }

  root.LM.Render = { render, VIEW_W, VIEW_H, HUD, ghostColor, COLOR: BASE, fmtTime };
})(window);
