// キーボード・タッチ入力
(function (root) {
  'use strict';
  const IN = root.LM.IN;
  const held = { L: false, R: false, J: false };
  const touchHeld = { L: false, R: false, J: false };
  const actions = [];

  const KEYS = {
    ArrowLeft: 'L', KeyA: 'L',
    ArrowRight: 'R', KeyD: 'R',
    ArrowUp: 'J', KeyW: 'J', Space: 'J', KeyK: 'J',
  };
  const ACTIONS = {
    KeyR: 'rewind', KeyU: 'undo', Backspace: 'undo', KeyX: 'restart',
    Escape: 'menu', Enter: 'confirm', KeyM: 'mute',
  };

  // 文字入力中はゲームの操作にしない
  const typing = (e) => {
    const el = e.target;
    if (!el || !el.tagName) return false;
    if (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return true;
    return el.tagName === 'INPUT' && el.type !== 'checkbox';
  };

  root.addEventListener('keydown', (e) => {
    if (typing(e)) return;
    // ボタンにフォーカスがあるときの Enter / Space はボタン自身に任せる
    if (e.target && e.target.tagName === 'BUTTON' && (e.code === 'Enter' || e.code === 'Space')) return;
    const k = KEYS[e.code];
    if (k) { held[k] = true; e.preventDefault(); }
    const a = ACTIONS[e.code];
    if (a && !e.repeat) { actions.push(a); e.preventDefault(); }
    root.LM.Audio.unlock();
  });
  root.addEventListener('keyup', (e) => {
    if (typing(e)) return;
    const k = KEYS[e.code];
    if (k) held[k] = false;
  });
  root.addEventListener('blur', () => {
    held.L = held.R = held.J = false;
    touchHeld.L = touchHeld.R = touchHeld.J = false;
  });

  function bindTouch(container) {
    container.querySelectorAll('[data-hold]').forEach((btn) => {
      const k = btn.dataset.hold;
      const on = (e) => { e.preventDefault(); touchHeld[k] = true; btn.classList.add('on'); root.LM.Audio.unlock(); try { btn.setPointerCapture(e.pointerId); } catch (err) { /* 無視 */ } };
      const off = (e) => { e.preventDefault(); touchHeld[k] = false; btn.classList.remove('on'); };
      btn.addEventListener('pointerdown', on);
      btn.addEventListener('pointerup', off);
      btn.addEventListener('pointercancel', off);
      btn.addEventListener('lostpointercapture', off);
    });
    container.querySelectorAll('[data-action]').forEach((btn) => {
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        root.LM.Audio.unlock();
        actions.push(btn.dataset.action);
      });
    });
    container.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  function bits() {
    let b = 0;
    if (held.L || touchHeld.L) b |= IN.L;
    if (held.R || touchHeld.R) b |= IN.R;
    if (held.J || touchHeld.J) b |= IN.J;
    return b;
  }

  root.LM.Input = {
    bits,
    bindTouch,
    takeActions() { return actions.splice(0, actions.length); },
  };
})(window);
