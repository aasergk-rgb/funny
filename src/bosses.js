// ボスステージ。各ワールドの最後に差し込む
// boss: { name, kind, hp, invuln（攻撃後の無敵フレーム）, path: [[フレーム, x, y], ...]（タイル単位・ボスの左上） }
// ボスは幅56・高さ48。地面（y=13タイル）に立つときの y は 11.5
(function (root) {
  'use strict';
  const LM = root.LM;
  const EMPTY = '#......................#';
  const WALL = '########################';

  const BOSSES = [
    {
      world: 0,
      name: '時計の番人',
      hint: '頭を踏んで攻撃！ ただし同じ自分の攻撃は1回しか効かない。攻撃のあと少しの間は無敵',
      time: 10, maxLoops: 5, par: 3, bossStage: true,
      boss: {
        name: '時計の番人', kind: 'clock', hp: 3, invuln: 90,
        path: [[0, 14, 11.5], [150, 5, 11.5], [300, 14, 11.5], [450, 5, 11.5], [600, 14, 11.5]],
      },
      map: [WALL, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY,
        '#P...................G.#', WALL],
    },
    {
      world: 1,
      name: '歯車の主',
      hint: '空から3回、決まった場所に降りてくる。降りてくる真下にいるとつぶされる',
      time: 10, maxLoops: 5, par: 3, bossStage: true,
      boss: {
        name: '歯車の主', kind: 'gear', hp: 3, invuln: 90,
        path: [
          [0, 4, 2.5], [40, 4, 2.5], [70, 4, 11.5], [150, 4, 11.5], [180, 4, 2.5],
          [220, 11, 2.5], [250, 11, 11.5], [330, 11, 11.5], [360, 11, 2.5],
          [400, 18, 2.5], [430, 18, 11.5], [510, 18, 11.5], [540, 18, 2.5], [600, 11, 2.5],
        ],
      },
      map: [WALL, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY,
        '#.......--.....--......#', EMPTY, EMPTY,
        '#P....................G#', WALL],
    },
    {
      world: 2,
      name: '裂け目の主',
      hint: '4か所を順番に瞬間移動する。次に現れる場所には影が出る。高い足場へは渦で',
      time: 10, maxLoops: 6, par: 4, bossStage: true,
      boss: {
        name: '裂け目の主', kind: 'rift', hp: 4, invuln: 90,
        path: [
          [0, 5, 11.5], [130, 5, 11.5], [131, 16.5, 4.5], [280, 16.5, 4.5],
          [281, 11.5, 11.5], [430, 11.5, 11.5], [431, 3.5, 4.5], [600, 3.5, 4.5],
        ],
      },
      map: [WALL, EMPTY, EMPTY, EMPTY, EMPTY,
        '#G.....2.............1.#',
        '#########......#########',
        EMPTY, EMPTY, EMPTY, EMPTY, EMPTY,
        '#2P............1.......#', WALL],
    },
  ];

  // 各ワールドの最後に差し込む（後ろのワールドの開始位置をずらす）
  for (const b of BOSSES) {
    const w = LM.WORLDS[b.world];
    const at = w.start + w.count;
    LM.LEVELS.splice(at, 0, b);
    w.count++;
    for (let k = b.world + 1; k < LM.WORLDS.length; k++) LM.WORLDS[k].start++;
  }

  // 旧セーブ（ボス追加前）のステージ番号 → 新しい番号
  LM.migrateIndex = (i) => (i < 10 ? i : i < 20 ? i + 1 : i + 2);

  if (typeof module !== 'undefined' && module.exports) module.exports = { BOSSES };
})(typeof window !== 'undefined' ? window : globalThis);
