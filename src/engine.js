// ループ・ミー：ゲームの中核シミュレーション（DOM 非依存。ブラウザでも Node でも動く）
(function (root) {
  'use strict';

  const T = 32; // タイルサイズ(px)
  const FPS = 60;
  const PHY = {
    w: 20, h: 28,
    acc: 0.7, airAcc: 0.45, fric: 0.8, max: 3.2,
    g: 0.62, jump: -10.2, cut: 0.7, maxFall: 11,
    coyote: 6, buffer: 6,
    spring: -14, crumble: 36,
    timer: 180, enemySpeed: 1.2, stomp: -7.5,
  };
  const IN = { L: 1, R: 2, J: 4 };
  const PARADOX_TOLERANCE = 0.75;

  function parseLevel(def) {
    const map = def.map;
    const H = map.length;
    const W = map[0].length;
    const L = {
      def, W, H, tiles: [], stars: [], plates: [], doorTiles: {},
      start: null, goal: null, key: null, lockTiles: [],
      portals: {}, enemies: [],
    };
    for (let y = 0; y < H; y++) {
      if (map[y].length !== W) throw new Error(`${def.name}: 行 ${y} の長さが ${map[y].length}（${W} のはず）`);
      const row = [];
      for (let x = 0; x < W; x++) {
        const c = map[y][x];
        let t = c;
        if (c === 'P') { L.start = { x, y }; t = '.'; }
        else if (c === '*') { L.stars.push({ id: L.stars.length, x, y }); t = '.'; }
        else if (c === 'G') { L.goal = { x, y }; t = '.'; }
        else if (c === 'k') { L.key = { x, y }; t = '.'; }
        else if (c >= 'a' && c <= 'e') { L.plates.push({ x, y, letter: c.toUpperCase() }); t = '.'; }
        else if (c >= 'A' && c <= 'E') { (L.doorTiles[c] = L.doorTiles[c] || []).push({ x, y }); }
        else if (c === 'L') { L.lockTiles.push({ x, y }); }
        else if (c === 't') { L.plates.push({ x, y, letter: 'T', timer: true }); t = '.'; }
        else if (c === 'T') { (L.doorTiles.T = L.doorTiles.T || []).push({ x, y }); }
        else if (c >= '1' && c <= '4') { (L.portals[c] = L.portals[c] || []).push({ x, y }); }
        else if (c === 'm') { L.enemies.push({ x, y }); t = '.'; }
        row.push(t);
      }
      L.tiles.push(row);
    }
    if (def.lenient) return L; // エディタの表示用
    if (!L.start || !L.goal) throw new Error(`${def.name}: P と G が必要です`);
    for (const d in L.portals) {
      if (L.portals[d].length !== 2) throw new Error(`${def.name}: ワープ ${d} は2つ1組で置いてください`);
    }
    return L;
  }

  function overlap(ax, ay, aw, ah, bx, by, bw, bh) {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
  }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function approach(v, target, step) {
    if (v < target) return Math.min(v + step, target);
    if (v > target) return Math.max(v - step, target);
    return v;
  }

  class Sim {
    constructor(def) {
      this.def = def;
      this.L = parseLevel(def);
      this.loopFrames = Math.round((def.time || 10) * FPS);
    }

    // ghostRecs: これまでのループの記録（古い順）
    startLoop(ghostRecs) {
      this.frame = 0;
      this.loopId = (this.loopId || 0) + 1;
      this.actors = ghostRecs.map((rec, i) => this.makeActor(i, rec));
      this.player = this.makeActor(ghostRecs.length, null);
      this.actors.push(this.player);
      this.rec = { inputs: [], pos: [], stars: [] };
      this.doorOpen = {};
      for (const k in this.L.doorTiles) this.doorOpen[k] = false;
      this.lockOpen = false;
      this.keyTaken = false;
      this.starsLoop = new Set();
      this.crumbleAt = {};
      this.timerT = 0;
      this.boss = null;
      if (this.def.boss) {
        const bd = this.def.boss;
        const p0 = this.bossAt(0);
        this.boss = { def: bd, w: 56, h: 48, x: p0[0], y: p0[1], px: p0[0], py: p0[1], hp: bd.hp, alive: true, hitBy: new Set(), invuln: 0 };
      }
      this.enemies = this.L.enemies.map((e) => ({ x: e.x * T + 4, y: (e.y + 1) * T - 20, w: 24, h: 20, dir: 1, alive: true }));
      this.committed = new Set();
      for (const r of ghostRecs) for (const s of r.stars) this.committed.add(s);
      this.plats = (this.def.platforms || []).map((p) => {
        const o = { def: p, w: p.w * T, h: 10, x: 0, y: 0, dx: 0, dy: 0, py: 0 };
        this.placePlat(o, 0);
        return o;
      });
      this.computeDoors([]);
    }

    makeActor(idx, rec) {
      const s = this.L.start;
      return {
        idx, rec, ghost: !!rec, w: PHY.w, h: PHY.h,
        x: s.x * T + (T - PHY.w) / 2, y: (s.y + 1) * T - PHY.h,
        vx: 0, vy: 0, onGround: false, support: null, springing: false,
        coyote: 0, jumpBuf: 0, prevJ: false,
        alive: true, facing: 1, dx: 0, dy: 0, px: 0, py: 0, fate: null,
      };
    }

    placePlat(o, f) {
      const p = o.def;
      const ph = ((f + (p.phase || 0)) % p.period) / p.period;
      const s = (1 - Math.cos(ph * Math.PI * 2)) / 2; // 0→1→0 のなめらかな往復
      const nx = p.x * T + (p.dx || 0) * T * s;
      const ny = p.y * T + (p.dy || 0) * T * s;
      o.dx = nx - o.x; o.dy = ny - o.y;
      o.py = o.y;
      o.x = nx; o.y = ny;
    }

    solid(cx, cy) {
      if (cx < 0 || cx >= this.L.W || cy < 0) return true;
      if (cy >= this.L.H) return false;
      const c = this.L.tiles[cy][cx];
      if (c === '#' || c === 'S') return true;
      if (c === 'L') return !this.lockOpen;
      if (c === 'T') return !this.doorOpen.T;
      if (c === 'E') return !!this.doorOpen.E; // かけ橋：スイッチが押されている間だけ現れる
      if (c >= 'A' && c <= 'D') return !this.doorOpen[c];
      if (c === '~') return !this.crumbled(cx, cy);
      return false;
    }

    crumbled(cx, cy) {
      const t = this.crumbleAt[cy * 1000 + cx];
      return t !== undefined && this.frame >= t + PHY.crumble;
    }

    // 一方通行の床：上から乗るときだけ止まる
    oneWay(cx, cy, prevBottom) {
      if (cx < 0 || cx >= this.L.W || cy < 0 || cy >= this.L.H) return false;
      return this.L.tiles[cy][cx] === '-' && prevBottom <= cy * T + 0.01;
    }

    tileAt(cx, cy) {
      if (cx < 0 || cx >= this.L.W || cy < 0 || cy >= this.L.H) return '#';
      return this.L.tiles[cy][cx];
    }

    moveX(a, dx) {
      if (dx === 0) return false;
      a.x += dx;
      const y0 = Math.floor(a.y / T), y1 = Math.floor((a.y + a.h - 0.001) / T);
      if (dx > 0) {
        const cx = Math.floor((a.x + a.w - 0.001) / T);
        for (let cy = y0; cy <= y1; cy++) if (this.solid(cx, cy)) { a.x = cx * T - a.w; return true; }
      } else {
        const cx = Math.floor(a.x / T);
        for (let cy = y0; cy <= y1; cy++) if (this.solid(cx, cy)) { a.x = (cx + 1) * T; return true; }
      }
      return false;
    }

    moveY(a, dy) {
      if (dy === 0) return null;
      a.y += dy;
      const x0 = Math.floor(a.x / T), x1 = Math.floor((a.x + a.w - 0.001) / T);
      if (dy > 0) {
        const cy = Math.floor((a.y + a.h - 0.001) / T);
        const prevBottom = a.y + a.h - dy;
        for (let cx = x0; cx <= x1; cx++) {
          if (this.solid(cx, cy) || this.oneWay(cx, cy, prevBottom)) { a.y = cy * T - a.h; return 'down'; }
        }
      } else {
        const cy = Math.floor(a.y / T);
        for (let cx = x0; cx <= x1; cx++) if (this.solid(cx, cy)) { a.y = (cy + 1) * T; return 'up'; }
      }
      return null;
    }

    pressing(a, p) {
      return overlap(a.x, a.y, a.w, a.h, p.x * T + 3, (p.y + 1) * T - 8, T - 6, 8);
    }

    platePressed(p) {
      return this.actors.some((a) => a.alive && this.pressing(a, p));
    }

    computeDoors(ev) {
      for (const letter in this.L.doorTiles) {
        const ps = this.L.plates.filter((p) => p.letter === letter);
        let open;
        if (letter === 'T') {
          // 時限スイッチ：最後に押されてから一定時間だけ開く
          if (ps.some((p) => this.platePressed(p))) this.timerT = PHY.timer;
          else if (this.timerT > 0) this.timerT--;
          open = this.timerT > 0;
        } else {
          open = ps.length > 0 && ps.every((p) => this.platePressed(p));
        }
        // 扉（かけ橋）は誰かが挟まっている間は閉まらない（現れない）
        const becomesSolid = letter === 'E' ? (open && !this.doorOpen[letter]) : (!open && this.doorOpen[letter]);
        if (becomesSolid) {
          const stuck = this.L.doorTiles[letter].some((t) =>
            this.actors.some((a) => a.alive && overlap(a.x, a.y, a.w, a.h, t.x * T, t.y * T, T, T)));
          if (stuck) open = !open;
        }
        if (open !== this.doorOpen[letter]) {
          this.doorOpen[letter] = open;
          ev.push({ type: open ? 'doorOpen' : 'doorClose', letter });
        }
      }
    }

    updateActor(a, bits, ev) {
      const L = (bits & IN.L) !== 0, R = (bits & IN.R) !== 0, J = (bits & IN.J) !== 0;
      const jp = J && !a.prevJ;
      a.prevJ = J;

      // 乗っているもの（ゴースト・動く床）に運ばれる
      if (a.support) {
        const s = a.support;
        if (s.alive === false || !(a.x + a.w > s.x && a.x < s.x + s.w)) {
          a.support = null;
        } else {
          this.moveX(a, s.dx);
          this.moveY(a, (s.y - a.h) - a.y);
          if (!(a.x + a.w > s.x && a.x < s.x + s.w)) a.support = null;
        }
      }

      const dir = (R ? 1 : 0) - (L ? 1 : 0);
      if (dir) {
        a.facing = dir;
        const acc = a.onGround ? PHY.acc : PHY.airAcc;
        a.vx += clamp(dir * PHY.max - a.vx, -acc, acc);
      } else {
        a.vx = approach(a.vx, 0, a.onGround ? PHY.fric : PHY.airAcc * 0.5);
      }

      if (jp) a.jumpBuf = PHY.buffer; else if (a.jumpBuf > 0) a.jumpBuf--;
      if (a.onGround) a.coyote = PHY.coyote; else if (a.coyote > 0) a.coyote--;
      if (a.jumpBuf > 0 && a.coyote > 0) {
        a.vy = PHY.jump;
        a.jumpBuf = 0; a.coyote = 0; a.onGround = false; a.support = null;
        if (!a.ghost) ev.push({ type: 'jump' });
      }
      if (a.vy >= 0) a.springing = false;
      if (!J && a.vy < 0 && !a.springing) a.vy += PHY.g * PHY.cut; // ボタンを離すと低いジャンプ
      a.vy = Math.min(a.vy + PHY.g, PHY.maxFall);

      if (this.moveX(a, a.vx)) a.vx = 0;

      const prevBottom = a.y + a.h;
      const hit = this.moveY(a, a.vy);
      a.onGround = false;
      a.support = null;

      // ゴーストの頭・動く床には上から乗れる（下からはすり抜け）
      let best = null;
      {
        // 相手の上面に対して「上から近づいて接した」ら乗る（上昇中のゴーストにも乗れる）
        const bottom = a.y + a.h;
        const cands = this.plats.concat(this.actors);
        for (const c of cands) {
          if (c === a || c.alive === false) continue;
          if (!(a.x + a.w > c.x && a.x < c.x + c.w)) continue;
          const relPrev = prevBottom - c.py;
          const relNow = bottom - c.y;
          if (relPrev <= 0.01 && relNow >= -0.01 && relNow >= relPrev - 0.001) {
            if (!best || c.y < best.y) best = c;
          }
        }
      }
      if (best) {
        const wasAir = a.vy > 2;
        a.y = best.y - a.h;
        a.vy = 0; a.onGround = true; a.support = best;
        if (wasAir && !a.ghost) ev.push({ type: 'land' });
      } else if (hit === 'down') {
        const impact = a.vy;
        a.vy = 0; a.onGround = true;
        const cy = Math.floor((a.y + a.h) / T);
        const x0 = Math.floor(a.x / T), x1 = Math.floor((a.x + a.w - 0.001) / T);
        let spring = false;
        for (let cx = x0; cx <= x1; cx++) {
          const c = this.tileAt(cx, cy);
          if (c === 'S') spring = true;
          if (c === '~' && this.crumbleAt[cy * 1000 + cx] === undefined) {
            this.crumbleAt[cy * 1000 + cx] = this.frame;
            ev.push({ type: 'crumble', x: cx, y: cy });
          }
        }
        if (spring) {
          a.vy = PHY.spring; a.onGround = false; a.springing = true; a.coyote = 0;
          ev.push({ type: 'spring', ghost: a.ghost, x: a.x, y: a.y });
        } else if (impact > 2 && !a.ghost) ev.push({ type: 'land' });
      } else if (hit === 'up') {
        a.vy = 0;
      }

      a.dx = a.x - a.px;
      a.dy = a.y - a.py;
    }

    touchingSpike(a) {
      const x0 = Math.floor(a.x / T), x1 = Math.floor((a.x + a.w - 0.001) / T);
      const y0 = Math.floor(a.y / T), y1 = Math.floor((a.y + a.h - 0.001) / T);
      for (let cy = y0; cy <= y1; cy++) {
        if (cy < 0 || cy >= this.L.H) continue;
        for (let cx = x0; cx <= x1; cx++) {
          if (cx < 0 || cx >= this.L.W) continue;
          if (this.L.tiles[cy][cx] === '^' && overlap(a.x, a.y, a.w, a.h, cx * T + 4, cy * T + 18, T - 8, 14)) return true;
        }
      }
      return false;
    }

    // ゴールが開く条件：星を全部集め、ボスがいれば倒している
    allStars() {
      if (this.boss && this.boss.alive) return false;
      return this.L.stars.every((s) => this.committed.has(s.id) || this.starsLoop.has(s.id));
    }

    // ---- ボス ----
    // 動きは時間だけで決まる（毎ループ同じ）。path は [フレーム, x, y]（タイル単位・左上）の列
    bossAt(f) {
      const path = this.def.boss.path;
      let i = 0;
      while (i < path.length - 2 && f >= path[i + 1][0]) i++;
      const a = path[i], b = path[Math.min(i + 1, path.length - 1)];
      const k = b[0] === a[0] ? 0 : Math.min(1, Math.max(0, (f - a[0]) / (b[0] - a[0])));
      return [(a[1] + (b[1] - a[1]) * k) * T, (a[2] + (b[2] - a[2]) * k) * T];
    }

    updateBoss(f) {
      const b = this.boss;
      if (!b || !b.alive) return;
      b.px = b.x; b.py = b.y;
      const p = this.bossAt(f);
      b.x = p[0]; b.y = p[1];
      if (b.invuln > 0) b.invuln--;
    }

    // ボスに触れたら true（やられる）。頭を踏めば跳ねる。
    // ダメージが入るのは「無敵時間でない」かつ「その人がこのループでまだ攻撃していない」ときだけ
    bossContact(a, ev) {
      const b = this.boss;
      if (!b || !b.alive) return false;
      if (!overlap(a.x, a.y, a.w, a.h, b.x + 4, b.y + 2, b.w - 8, b.h - 2)) return false;
      if (a.py + a.h > b.py + 14) return true;
      a.y = b.y - a.h;
      a.vy = PHY.stomp * 1.3; a.onGround = false; a.support = null; a.springing = true;
      if (b.invuln > 0) ev.push({ type: 'bossBlock', reason: 'invuln', ghost: a.ghost });
      else if (b.hitBy.has(a.idx)) ev.push({ type: 'bossBlock', reason: 'same', ghost: a.ghost });
      else {
        b.hitBy.add(a.idx);
        b.hp--;
        b.invuln = b.def.invuln || 90;
        ev.push({ type: 'bossHit', hp: b.hp, x: b.x + b.w / 2, y: b.y + b.h / 2, idx: a.idx, ghost: a.ghost });
        if (b.hp <= 0) { b.alive = false; ev.push({ type: 'bossDown', x: b.x + b.w / 2, y: b.y + b.h / 2 }); }
      }
      return false;
    }

    // 敵：左右に歩き、壁や足場の端で折り返す（毎ループ同じ動き）
    updateEnemies() {
      for (const e of this.enemies) {
        if (!e.alive) continue;
        const nx = e.x + PHY.enemySpeed * e.dir;
        const front = e.dir > 0 ? nx + e.w : nx;
        const fx = Math.floor((e.dir > 0 ? front - 0.001 : front) / T);
        const midY = Math.floor((e.y + e.h / 2) / T);
        const footY = Math.floor((e.y + e.h + 1) / T);
        const floor = this.solid(fx, footY) || this.tileAt(fx, footY) === '-';
        if (this.solid(fx, midY) || !floor) e.dir = -e.dir;
        else e.x = nx;
      }
    }

    // 敵に触れたら true。上から踏んだら敵を倒して跳ねる
    enemyContact(a, ev) {
      for (const e of this.enemies) {
        if (!e.alive) continue;
        if (!overlap(a.x, a.y, a.w, a.h, e.x + 2, e.y + 2, e.w - 4, e.h - 2)) continue;
        if (a.y > a.py && a.py + a.h <= e.y + 8) {
          e.alive = false;
          a.vy = PHY.stomp; a.onGround = false; a.support = null;
          ev.push({ type: 'stomp', x: e.x, y: e.y, ghost: a.ghost });
          continue;
        }
        return true;
      }
      return false;
    }

    // ワープ：同じ数字の出口へ移動（出口から出るまでは再ワープしない）
    warp(a, ev) {
      const cx = Math.floor((a.x + a.w / 2) / T), cy = Math.floor((a.y + a.h / 2) / T);
      const c = this.tileAt(cx, cy);
      if (c >= '1' && c <= '4') {
        const key = cy * 1000 + cx;
        if (a.portalFrom === key) return;
        const pair = this.L.portals[c];
        const to = pair[0].x === cx && pair[0].y === cy ? pair[1] : pair[0];
        a.x = to.x * T + (T - a.w) / 2;
        a.y = (to.y + 1) * T - a.h - 2;
        a.support = null;
        a.portalFrom = to.y * 1000 + to.x;
        ev.push({ type: 'warp', from: { x: cx, y: cy }, to, ghost: a.ghost });
      } else {
        a.portalFrom = null;
      }
    }

    // 1フレーム進める。bits はプレイヤーの入力。発生したイベントの配列を返す
    step(bits) {
      const ev = [];
      const f = this.frame;

      for (const p of this.plats) this.placePlat(p, f + 1);
      this.computeDoors(ev);
      this.updateEnemies();
      this.updateBoss(f + 1);
      for (const a of this.actors) { a.px = a.x; a.py = a.y; }

      for (const a of this.actors) {
        if (!a.alive) continue;
        const b = a.ghost ? (f < a.rec.inputs.length ? a.rec.inputs[f] : 0) : bits;
        this.updateActor(a, b, ev);
        this.warp(a, ev);
        const hitEnemy = this.enemyContact(a, ev) || this.bossContact(a, ev);

        const dead = hitEnemy || this.touchingSpike(a) || a.y > this.L.H * T;
        if (a.ghost) {
          if (dead) {
            a.alive = false; a.fate = 'spike';
            ev.push({ type: 'ghostLost', idx: a.idx, x: a.x, y: a.y, reason: hitEnemy ? 'enemy' : 'spike' });
            continue;
          }
          if (f < a.rec.pos.length) {
            const p = a.rec.pos[f];
            if (Math.abs(p[0] - a.x) > PARADOX_TOLERANCE || Math.abs(p[1] - a.y) > PARADOX_TOLERANCE) {
              a.alive = false; a.fate = 'paradox';
              ev.push({ type: 'ghostLost', idx: a.idx, x: a.x, y: a.y, reason: 'paradox' });
              continue;
            }
          }
        } else if (dead) {
          a.alive = false;
          ev.push({ type: 'death', x: a.x, y: a.y });
        }

        // 星・鍵を拾う
        for (const s of this.L.stars) {
          if (this.starsLoop.has(s.id)) continue;
          if (overlap(a.x, a.y, a.w, a.h, s.x * T + 8, s.y * T + 8, 16, 16)) {
            this.starsLoop.add(s.id);
            if (!a.ghost) this.rec.stars.push(s.id);
            if (!this.committed.has(s.id)) ev.push({ type: 'star', id: s.id, x: s.x, y: s.y, ghost: a.ghost });
          }
        }
        const k = this.L.key;
        if (k && !this.keyTaken && overlap(a.x, a.y, a.w, a.h, k.x * T + 6, k.y * T + 6, 20, 20)) {
          this.keyTaken = true;
          this.lockOpen = true;
          ev.push({ type: 'key', x: k.x, y: k.y });
        }
      }

      const pl = this.player;
      if (pl.alive) {
        this.rec.inputs.push(bits);
        this.rec.pos.push([pl.x, pl.y]);
        const g = this.L.goal;
        if (this.allStars() && overlap(pl.x, pl.y, pl.w, pl.h, g.x * T + 8, g.y * T + 4, 16, 28)) {
          ev.push({ type: 'win' });
        }
      }

      this.frame++;
      if (this.frame >= this.loopFrames) ev.push({ type: 'timeout' });
      return ev;
    }
  }

  const api = { T, FPS, PHY, IN, Sim, parseLevel };
  root.LM = Object.assign(root.LM || {}, api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
