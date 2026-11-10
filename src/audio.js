// 効果音（Web Audio API で生成。音声ファイル不要）
(function (root) {
  'use strict';
  let ctx = null;
  let master = null;
  let muted = false;
  try { muted = localStorage.getItem('loopme-muted') === '1'; } catch (e) { /* 無視 */ }

  function ensure() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return ctx; }
    const AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(ctx.destination);
    return ctx;
  }

  function tone(freq, dur, opt) {
    const o = opt || {};
    const c = ensure();
    if (!c || muted) return;
    const t0 = c.currentTime + (o.delay || 0);
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = o.type || 'square';
    osc.frequency.setValueAtTime(freq, t0);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t0 + dur);
    const v = o.vol == null ? 0.12 : o.vol;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(v, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(master);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  }

  const SFX = {
    jump() { tone(420, 0.12, { to: 720, vol: 0.06 }); },
    land() { tone(140, 0.05, { type: 'triangle', vol: 0.06 }); },
    star() { tone(988, 0.1, { vol: 0.08 }); tone(1480, 0.18, { vol: 0.08, delay: 0.07 }); },
    key() { [660, 880, 1320].forEach((f, i) => tone(f, 0.12, { vol: 0.08, delay: i * 0.06, type: 'triangle' })); },
    doorOpen() { tone(260, 0.16, { to: 520, type: 'triangle', vol: 0.12 }); },
    doorClose() { tone(420, 0.14, { to: 200, type: 'triangle', vol: 0.1 }); },
    rewind() { tone(900, 0.6, { to: 90, type: 'sawtooth', vol: 0.06 }); tone(600, 0.6, { to: 60, type: 'square', vol: 0.03 }); },
    paradox() { tone(1200, 0.35, { to: 60, type: 'sawtooth', vol: 0.09 }); tone(300, 0.35, { to: 1500, type: 'square', vol: 0.04 }); },
    death() { tone(320, 0.35, { to: 70, type: 'sawtooth', vol: 0.1 }); },
    clear() { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.22, { vol: 0.08, delay: i * 0.09, type: 'triangle' })); },
    fail() { [392, 330, 262].forEach((f, i) => tone(f, 0.2, { vol: 0.08, delay: i * 0.12, type: 'triangle' })); },
    tick() { tone(1200, 0.04, { vol: 0.05 }); },
    click() { tone(660, 0.05, { vol: 0.05, type: 'triangle' }); },
  };

  function play(name) { if (SFX[name]) SFX[name](); }
  function toggleMute() {
    muted = !muted;
    if (master) master.gain.value = muted ? 0 : 0.5;
    try { localStorage.setItem('loopme-muted', muted ? '1' : '0'); } catch (e) { /* 無視 */ }
    return muted;
  }

  root.LM = Object.assign(root.LM || {}, {
    Audio: { play, unlock: ensure, toggleMute, isMuted: () => muted },
  });
})(window);
