// 効果音と BGM（Web Audio API で生成。音声ファイル不要）
(function (root) {
  'use strict';
  let ctx = null;
  let master = null, sfxGain = null, musicGain = null;
  let noiseBuf = null;

  const prefs = { muted: false, music: true, sfx: true };
  try {
    const saved = JSON.parse(localStorage.getItem('loopme-audio') || 'null');
    if (saved) Object.assign(prefs, saved);
  } catch (e) { /* 無視 */ }
  function savePrefs() {
    try { localStorage.setItem('loopme-audio', JSON.stringify(prefs)); } catch (e) { /* 無視 */ }
  }

  function applyGains() {
    if (!ctx) return;
    master.gain.value = prefs.muted ? 0 : 0.5;
    sfxGain.gain.value = prefs.sfx ? 1 : 0;
    musicGain.gain.value = prefs.music ? 0.55 : 0;
  }

  function ensure() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return ctx; }
    const AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    sfxGain = ctx.createGain();
    musicGain = ctx.createGain();
    sfxGain.connect(master);
    musicGain.connect(master);
    master.connect(ctx.destination);
    applyGains();
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    if (song) startScheduler();
    return ctx;
  }

  function tone(freq, dur, o, dest, at) {
    o = o || {};
    if (!ctx) return;
    const t0 = (at || ctx.currentTime) + (o.delay || 0);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = o.type || 'square';
    osc.frequency.setValueAtTime(freq, t0);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t0 + dur);
    const v = o.vol == null ? 0.12 : o.vol;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(v, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(dest || sfxGain);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  }

  function noise(dur, vol, dest, at, hp) {
    if (!ctx) return;
    const t0 = at || ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = hp || 6000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(dest || sfxGain);
    src.start(t0); src.stop(t0 + dur + 0.02);
  }

  const SFX = {
    jump() { tone(420, 0.12, { to: 720, vol: 0.06 }); },
    land() { tone(140, 0.05, { type: 'triangle', vol: 0.06 }); },
    star() { tone(988, 0.1, { vol: 0.08 }); tone(1480, 0.18, { vol: 0.08, delay: 0.07 }); },
    key() { [660, 880, 1320].forEach((f, i) => tone(f, 0.12, { vol: 0.08, delay: i * 0.06, type: 'triangle' })); },
    doorOpen() { tone(260, 0.16, { to: 520, type: 'triangle', vol: 0.12 }); },
    doorClose() { tone(420, 0.14, { to: 200, type: 'triangle', vol: 0.1 }); },
    spring() { tone(300, 0.2, { to: 900, type: 'triangle', vol: 0.1 }); },
    crumble() { noise(0.25, 0.08, null, null, 800); },
    rewind() { tone(900, 0.6, { to: 90, type: 'sawtooth', vol: 0.06 }); tone(600, 0.6, { to: 60, type: 'square', vol: 0.03 }); },
    paradox() { tone(1200, 0.35, { to: 60, type: 'sawtooth', vol: 0.09 }); tone(300, 0.35, { to: 1500, type: 'square', vol: 0.04 }); },
    death() { tone(320, 0.35, { to: 70, type: 'sawtooth', vol: 0.1 }); },
    clear() { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.22, { vol: 0.08, delay: i * 0.09, type: 'triangle' })); },
    fail() { [392, 330, 262].forEach((f, i) => tone(f, 0.2, { vol: 0.08, delay: i * 0.12, type: 'triangle' })); },
    tick() { tone(1200, 0.04, { vol: 0.05 }); },
    click() { tone(660, 0.05, { vol: 0.05, type: 'triangle' }); },
  };

  // ---- BGM：コード進行＋アルペジオ＋時計のチクタク ----
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const SONGS = {
    night: {
      bpm: 108,
      chords: [[57, 60, 64], [53, 57, 60], [55, 60, 64], [55, 59, 62]],
      bass: [0, 8], arp: [0, 1, 2, 1, 2, 1, 0, 1], lead: [76, null, 74, 72, null, 71, 72, null],
    },
    factory: {
      bpm: 128,
      chords: [[50, 53, 57], [46, 50, 53], [48, 52, 55], [45, 49, 52]],
      bass: [0, 3, 6, 8, 11, 14], arp: [0, 2, 1, 2, 0, 2, 1, 2], lead: [69, 72, null, 74, 72, null, 69, 65],
    },
    title: {
      bpm: 92,
      chords: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [52, 55, 59]],
      bass: [0], arp: [0, 1, 2, 1, 0, 1, 2, 1], lead: [],
    },
  };
  let song = null, songName = null, timer = null, nextTime = 0, step = 0;

  function scheduleStep(st, at) {
    const bar = Math.floor(st / 16) % song.chords.length;
    const s = st % 16;
    const ch = song.chords[bar];
    if (song.bass.includes(s)) tone(mtof(ch[0] - 24), 0.22, { type: 'triangle', vol: 0.16 }, musicGain, at);
    if (s % 2 === 0) {
      const n = ch[song.arp[(s / 2) % song.arp.length]] + 12;
      tone(mtof(n), 0.09, { type: 'square', vol: 0.022 }, musicGain, at);
    }
    if (s % 4 === 2) noise(0.03, 0.035, musicGain, at);
    if (s % 8 === 4 && song.lead.length) {
      const ln = song.lead[(Math.floor(st / 8)) % song.lead.length];
      if (ln) tone(mtof(ln), 0.32, { type: 'triangle', vol: 0.05 }, musicGain, at);
    }
  }

  function startScheduler() {
    if (timer || !ctx || !song) return;
    nextTime = ctx.currentTime + 0.05;
    timer = setInterval(() => {
      if (!song) return;
      const dt = 60 / song.bpm / 4;
      while (nextTime < ctx.currentTime + 0.15) {
        scheduleStep(step, nextTime);
        nextTime += dt;
        step++;
      }
    }, 30);
  }

  function music(name) {
    if (name === songName) return;
    songName = name;
    song = name ? SONGS[name] : null;
    step = 0;
    if (!song) { if (timer) { clearInterval(timer); timer = null; } return; }
    if (ctx) { if (timer) { clearInterval(timer); timer = null; } startScheduler(); }
  }

  // 巻き戻し中は BGM を一瞬下げる
  function duck(sec) {
    if (!ctx || !prefs.music) return;
    const t = ctx.currentTime;
    musicGain.gain.cancelScheduledValues(t);
    musicGain.gain.setValueAtTime(0.08, t);
    musicGain.gain.linearRampToValueAtTime(0.55, t + sec);
  }

  root.LM = Object.assign(root.LM || {}, {
    Audio: {
      play(name) { if (ctx && SFX[name]) SFX[name](); },
      unlock: ensure,
      music,
      duck,
      toggleMute() { prefs.muted = !prefs.muted; applyGains(); savePrefs(); return prefs.muted; },
      setOption(key, val) { prefs[key] = val; applyGains(); savePrefs(); },
      prefs,
      isMuted: () => prefs.muted,
    },
  });
})(window);
