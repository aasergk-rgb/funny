// 全ステージが想定どおり解けるかを、自動操作ボットで確かめるテスト
// 使い方: node tests/run.js [ステージ番号]
'use strict';
const { Sim, T, IN } = require('../src/engine.js');
const { LEVELS } = require('../src/levels.js');
require('../src/levels2.js');
require('../src/levels3.js');
const SOLUTIONS = require('./solutions.js');

function keyBits(s) {
  let b = 0;
  if (s.includes('L')) b |= IN.L;
  if (s.includes('R')) b |= IN.R;
  if (s.includes('J')) b |= IN.J;
  return b;
}

// コマンド列を1フレームずつ入力に変換するボット
function makeBot(cmds) {
  let i = 0, n = 0, last = 0;
  return function next(sim) {
    const out = step(sim);
    // ジャンプを続けて押すときは、1フレーム離してから押し直す
    if (out !== null && (out & IN.J) && (last & IN.J) && n === 1 && cmds[i] && cmds[i][0] === 'hold') {
      n = 0; last = 0; return 0;
    }
    last = out || 0;
    return out;
  };
  function step(sim) {
    const p = sim.player;
    const cx = (p.x + p.w / 2) / T;
    while (i < cmds.length) {
      const [op, a, b] = cmds[i];
      if (op === 'go' || op === 'goJ') {
        const d = a - cx;
        if (Math.abs(d) < 0.08 && (op === 'go' || p.onGround)) { i++; n = 0; continue; }
        return (d > 0 ? IN.R : IN.L) | (op === 'goJ' ? IN.J : 0);
      }
      if (op === 'wait') { if (n++ < a) return 0; i++; n = 0; continue; }
      if (op === 'until') { if (sim.frame < a) return 0; i++; continue; }
      if (op === 'hold') { if (n++ < b) return keyBits(a); i++; n = 0; continue; }
      if (op === 'holdUntil') { if (!b(sim)) return keyBits(a); i++; continue; }
      if (op === 'when') { if (!a(sim)) return 0; i++; continue; }
      if (op === 'ground') { if (!p.onGround) return 0; i++; continue; }
      throw new Error('unknown op ' + op);
    }
    return null; // 終了 → 巻き戻し
  }
}

function runLevel(idx, verbose) {
  const def = LEVELS[idx];
  const sol = SOLUTIONS[idx];
  const sim = new Sim(def);
  const ghosts = [];
  const log = [];
  for (let li = 0; li < sol.length; li++) {
    sim.startLoop(ghosts);
    const bot = makeBot(sol[li]);
    const last = li === sol.length - 1;
    let won = false, done = false;
    while (!done) {
      const bits = bot(sim);
      if (bits === null && !last) break;
      const ev = sim.step(bits === null ? 0 : bits);
      for (const e of ev) {
        if (e.type === 'win') { won = true; done = true; }
        if (e.type === 'death') throw new Error(`ステージ${idx + 1} ループ${li + 1}: f${sim.frame} でやられた x=${((sim.player.x + 10) / T).toFixed(2)} y=${((sim.player.y + 28) / T).toFixed(2)}`);
        if (e.type === 'ghostLost') log.push(`ループ${li + 1} f${sim.frame}: ゴースト${e.idx + 1} 消失(${e.reason})`);
        if (e.type === 'timeout') done = true;
      }
      if (verbose && sim.frame % (process.env.EVERY ? +process.env.EVERY : 15) === 0) {
        const p = sim.player;
        log.push(`  L${li + 1} f${sim.frame} ${process.env.GHOSTS ? sim.actors.slice(0, -1).map((g) => `[${((g.x + 10) / T).toFixed(1)},${((g.y + 28) / T).toFixed(1)}${g.alive ? '' : 'x'}]`).join('') : ''} x=${((p.x + p.w / 2) / T).toFixed(2)} y=${((p.y + p.h) / T).toFixed(2)} g=${p.onGround}`);
      }
      if (sim.frame >= sim.loopFrames) done = true;
    }
    if (last) return { won, loops: sol.length, frames: sim.frame, log };
    ghosts.push(sim.rec);
  }
}

const only = process.argv[2] ? [Number(process.argv[2]) - 1] : LEVELS.map((_, i) => i);
let fail = 0;
for (const i of only) {
  try {
    const r = runLevel(i, only.length === 1);
    const ok = r.won && r.loops <= LEVELS[i].maxLoops;
    if (!ok) fail++;
    console.log(`${ok ? 'OK  ' : 'FAIL'} ステージ${i + 1}「${LEVELS[i].name}」 ${r.loops}ループ (目標${LEVELS[i].par}) 最終ループ ${r.frames}f`);
    if (!ok || only.length === 1) for (const l of r.log) console.log('   ', l);
  } catch (e) {
    fail++;
    console.log(`FAIL ステージ${i + 1}「${LEVELS[i].name}」 ${e.message}`);
  }
}
process.exit(fail ? 1 : 0);
