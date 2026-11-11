// 各ステージの模範解答（ループごとのボット用コマンド列）
// ['go', x]      : タイル座標 x（キャラ中心）まで歩く
// ['goJ', x]     : ジャンプを押しっぱなしで x まで進む
// ['hold', k, n] : キー k（L/R/J の組み合わせ）を n フレーム押す
// ['wait', n] / ['until', f] / ['ground']（着地まで待つ）
// コマンドが尽きたら R（巻き戻し）。最後のループはゴールするまで続ける
'use strict';
module.exports = [
  // 1 はじめの一歩
  [[
    ['go', 7.2], ['hold', 'RJ', 14], ['ground'], ['go', 9.4], ['hold', 'RJ', 18], ['ground'],
    ['go', 12.4], ['hold', 'RJ', 20], ['ground'], ['go', 15.5], ['go', 17.4], ['ground'], ['go', 19.4],
    ['hold', 'RJ', 20], ['ground'], ['go', 22.5],
  ]],
  // 2 もうひとりの僕
  [
    [['go', 5.5]],
    [['go', 21.5]],
  ],
  // 3 肩車
  [
    [['go', 11.6]],
    [['go', 10.3], ['hold', 'RJ', 30], ['ground'], ['hold', 'RJ', 40], ['ground'], ['go', 20.5]],
  ],
  // 4 せーの！
  [
    [['go', 3.5]],
    [['go', 7.3], ['hold', 'RJ', 14], ['ground'], ['go', 9.5]],
    [['go', 7.3], ['hold', 'RJ', 14], ['ground'], ['go', 10.8], ['go', 21.5]],
  ],
  // 5 肩車タワー（土台 → 2段目 の順に積む）
  [
    [['go', 3.5]],
    [['go', 13.6]],
    [['go', 12.3], ['hold', 'RJ', 30], ['ground'], ['go', 13.6]],
    [['wait', 40], ['go', 12.0], ['hold', 'RJ', 30], ['ground'], ['hold', 'RJ', 40], ['ground'], ['go', 16.5], ['go', 21.5]],
  ],
  // 6 動く床
  [
    [
      ['hold', 'RJ', 10], ['hold', 'J', 20], ['ground'], ['go', 2.9], ['until', 112], ['hold', 'J', 16], ['ground'],
      ['until', 230], ['go', 5.4], ['until', 285], ['hold', 'RJ', 30], ['ground'], ['until', 445], ['go', 18.5],
    ],
    // ゴーストが床から降りてくる場所に立っているとパラドックスになるので、後から行く
    [['until', 238], ['go', 5.4], ['until', 285], ['hold', 'RJ', 30], ['ground'], ['until', 445], ['go', 22.5]],
  ],
  // 7 鍵はひとつ
  [
    [['go', 18.3], ['hold', 'RJ', 14], ['ground'], ['go', 21.5]],
    [['go', 5.5], ['until', 130], ['go', 2.5]],
  ],
  // 8 自分の邪魔（ゴーストの着地点を避けて待つ）
  [
    [
      ['go', 4.3], ['hold', 'RJ', 14], ['ground'], ['go', 6.4], ['hold', 'RJ', 14], ['ground'],
      ['go', 8.4], ['hold', 'RJ', 16], ['ground'], ['go', 11.5], ['go', 14.5],
    ],
    [
      ['go', 4.3], ['hold', 'RJ', 14], ['ground'], ['go', 6.4], ['hold', 'RJ', 14], ['ground'],
      ['go', 10.5], ['until', 330], ['go', 21.5],
    ],
  ],
  // 9 あちらを立てれば
  [
    [['until', 240], ['go', 3.5]],
    [['go', 16.4], ['until', 280], ['go', 21.5]],
  ],
  // 10 全員集合
  [
    [['go', 7.6]],
    [['go', 6.3], ['hold', 'RJ', 30], ['ground'], ['hold', 'RJ', 40], ['ground'], ['go', 9.5], ['go', 10.4],
      ['hold', 'RJ', 40], ['ground'], ['go', 15.5]],
    [['go', 4.5]],
    [['go', 6.3], ['hold', 'RJ', 30], ['ground'], ['hold', 'RJ', 40], ['ground'], ['go', 10.4],
      ['hold', 'RJ', 40], ['ground'], ['go', 20.5], ['go', 16.5]],
  ],
];

// ===== ワールド2 =====
const ghost = (i) => (s) => s.actors[i];
module.exports.push(
  // 11 ジャンプ台
  [[['go', 5.6], ['hold', 'J', 10], ['hold', 'R', 6], ['wait', 20], ['hold', 'R', 60], ['ground'], ['go', 21.5]]],
  // 12 すり抜け床
  [
    [['go', 3.5], ['hold', 'J', 20], ['ground'], ['go', 5.5], ['hold', 'J', 20], ['ground'],
      ['hold', 'J', 20], ['ground'], ['hold', 'J', 20], ['ground'], ['go', 7.5]],
    [['go', 21.5]],
  ],
  // 13 かけ橋
  [
    [['go', 4.5]],
    [['go', 10.5], ['hold', 'RJ', 15], ['ground'], ['go', 20.5]],
  ],
  // 14 くずれる床（ゴーストのすぐ後ろをついていく）
  [
    [['go', 16.5]],
    [['wait', 10], ['go', 21.5]],
  ],
  // 15 ゴーストエレベーター（ジャンプ台の横で待つゴーストの頭に乗り、一緒に跳ねる）
  [
    [['go', 5.6], ['wait', 150], ['hold', 'J', 10], ['hold', 'R', 6]],
    [['go', 4.3], ['hold', 'RJ', 14], ['ground'],
      ['when', (s) => s.player.support === ghost(0)(s) && ghost(0)(s).springing && ghost(0)(s).vy > -1.5],
      ['hold', 'RJ', 30], ['ground'], ['go', 21.5]],
  ],
  // 16 塔の上の鍵
  [
    [['go', 14.5], ['hold', 'J', 20], ['ground'], ['go', 15.5], ['hold', 'J', 20], ['ground'],
      ['hold', 'J', 20], ['ground'], ['go', 14.5], ['go', 15.5], ['hold', 'J', 20], ['ground'], ['go', 17.5]],
    [['go', 5.5], ['when', (s) => s.lockOpen], ['go', 2.5]],
  ],
  // 17 時間差トリオ
  [
    [['go', 3.5]],
    [['go', 13.5]],
    [['wait', 5], ['go', 21.5]],
  ],
  // 18 リレー
  [
    [['go', 3.5]],
    [['go', 7.3], ['hold', 'RJ', 12], ['hold', 'R', 50], ['ground'], ['go', 10.5]],
    [['go', 7.3], ['hold', 'RJ', 12], ['hold', 'R', 50], ['ground'], ['go', 12.5], ['ground'], ['go', 15.5]],
    [['go', 7.3], ['hold', 'RJ', 12], ['hold', 'R', 50], ['ground'], ['go', 12.5], ['ground'], ['go', 21.5]],
  ],
  // 19 歯車の塔
  [
    [['go', 7.5]],
    [['go', 11.2], ['hold', 'RJ', 10], ['ground'], ['go', 15.3], ['hold', 'RJ', 20], ['ground'],
      ['go', 15.6], ['hold', 'LJ', 22], ['ground'], ['go', 9.3], ['hold', 'LJ', 14], ['ground'], ['go', 2.5]],
  ],
  // 20 時計塔の頂上
  [
    [['go', 2.4], ['wait', 150], ['hold', 'LJ', 16]],
    [['go', 3.6], ['hold', 'LJ', 6], ['hold', 'J', 10], ['ground'],
      ['when', (s) => s.player.support === ghost(0)(s) && ghost(0)(s).springing && ghost(0)(s).vy > -1.5],
      ['hold', 'RJ', 30], ['ground'], ['go', 6.5], ['go', 11.5]],
    [['go', 12.4], ['when', (s) => s.doorOpen.E], ['go', 18.4], ['when', (s) => s.lockOpen], ['go', 21.5]],
  ],
);

// ===== ワールド3 =====
const enemy = (i) => (s) => s.enemies[i];
const px = (s) => s.player.x + s.player.w / 2;
// 敵が近づいてきたら真上にジャンプして踏む
const stompWhenClose = (i) => [
  ['when', (s) => { const e = enemy(i)(s); return !e.alive || Math.abs(e.x + 12 - px(s)) < 44 && (e.x + 12 - px(s)) * e.dir < 0; }],
  ['hold', 'J', 14], ['ground'],
];
module.exports.push(
  // 3-1 ワープ
  [[['go', 4.5], ['holdUntil', 'R', (s) => px(s) > 12 * 32], ['holdUntil', 'L', (s) => px(s) < 12 * 32], ['go', 5.5],
    ['go', 7.5], ['ground'], ['holdUntil', 'L', (s) => px(s) > 12 * 32], ['go', 19.5], ['go', 21.5]]],
  // 3-2 時限スイッチ
  [[['go', 2.5], ['go', 6.3], ['hold', 'RJ', 14], ['ground'], ['go', 10.3], ['hold', 'RJ', 14], ['ground'], ['go', 20.5]]],
  // 3-3 パトロール
  [[
    ['go', 4.3], ['when', (s) => enemy(0)(s).x > 8.5 * 32], ['hold', 'RJ', 14], ['ground'], ...stompWhenClose(0),
    ['go', 8.5], ['hold', 'J', 12], ['ground'], ['go', 10.3], ['hold', 'RJ', 14], ['ground'],
    ['go', 13.3], ['hold', 'RJ', 14], ['ground'], ['when', (s) => enemy(1)(s).x > 17.5 * 32 && enemy(1)(s).dir > 0],
    ['hold', 'RJ', 14], ['ground'], ...stompWhenClose(1), ['go', 19.3], ['hold', 'RJ', 14], ['ground'], ['go', 21.5],
  ]],
  // 3-4 露払い
  [
    [['go', 4.3], ['when', (s) => enemy(0)(s).x > 10 * 32], ['hold', 'RJ', 14], ['ground'], ...stompWhenClose(0), ['go', 9.5]],
    [['go', 4.3], ['when', (s) => !enemy(0)(s).alive], ['hold', 'RJ', 14], ['ground'], ['go', 12.3], ['hold', 'RJ', 14], ['ground'], ['go', 21.5]],
  ],
  // 3-5 ワープの向こう（渦は飛び越えられる）
  [
    [['go', 6.5], ['wait', 5], ['go', 6.5]],
    [['go', 5.2], ['hold', 'RJ', 14], ['ground'], ['go', 20.5]],
  ],
  // 3-6 3秒の約束
  [
    [['go', 4.4], ['hold', 'J', 10], ['hold', 'L', 6], ['when', (s) => s.player.springing && s.player.y + 28 < 250], ['hold', 'L', 40], ['ground'], ['go', 1.5]],
    [['go', 20.4], ['when', (s) => s.doorOpen.T], ['go', 22.5]],
  ],
  // 3-7 渦と鍵
  [
    [['go', 13.3], ['when', (s) => enemy(0)(s).x > 18 * 32 && enemy(0)(s).dir > 0], ['hold', 'RJ', 14], ['ground'],
      ...stompWhenClose(0), ['go', 17.5], ['hold', 'J', 12], ['ground'], ['go', 19.3], ['hold', 'RJ', 14], ['ground'],
      ['go', 21.5], ['wait', 5], ['go', 3.5]],
    [['go', 5.5], ['when', (s) => s.lockOpen], ['go', 2.5]],
  ],
  // 3-8 時の裂け目
  [
    [['go', 2.3], ['when', (s) => enemy(0)(s).x > 6.5 * 32 && enemy(0)(s).dir > 0], ['hold', 'RJ', 12], ['ground'],
      ...stompWhenClose(0), ['go', 7.5]],
    [['go', 2.3], ['when', (s) => !enemy(0)(s).alive], ['hold', 'RJ', 12], ['ground'], ['go', 8.3], ['hold', 'RJ', 14], ['ground'],
      ['holdUntil', 'R', (s) => s.player.y < 6 * 32], ['go', 15.6]],
    [['go', 2.3], ['when', (s) => !enemy(0)(s).alive], ['hold', 'RJ', 12], ['ground'], ['go', 8.3], ['hold', 'RJ', 14], ['ground'],
      ['holdUntil', 'R', (s) => s.player.y < 6 * 32], ['go', 14.2], ['when', (s) => s.actors[1].onGround && s.actors[1].x > 15 * 32],
      ['hold', 'RJ', 14], ['ground'], ['hold', 'RJ', 30], ['ground'], ['go', 17.5], ['go', 22.5]],
  ],
);

// ===== ボス =====
const hits = (n) => (s) => s.boss.hitBy.size >= n || !s.boss.alive;
module.exports.byName = {
  // 時計の番人：左で1回、右で1回、また左で1回（90フレーム以上あけて、別々の自分が踏む）
  '時計の番人': [
    [['go', 4.0], ['when', (s) => s.boss.x < 6.6 * 32], ['hold', 'RJ', 16], ['when', hits(1)]],
    [['go', 4.0], ['when', (s) => s.frame > 300 && s.boss.x < 6.6 * 32], ['hold', 'RJ', 16], ['when', hits(2)]],
    [['go', 4.0], ['when', hits(1)], ['hold', 'RJ', 16], ['holdUntil', 'R', (s) => px(s) > s.boss.x + 56 + 30 && s.player.onGround], ['go', 16.9],
      ['when', (s) => s.boss.x > 13.2 * 32], ['hold', 'LJ', 20], ['when', hits(2)], ['hold', 'R', 30], ['go', 21.5]],
  ],
  // 歯車の主：3回の降下に、ひとりずつ
  '歯車の主': [
    [['go', 2.6], ['when', (s) => s.frame >= 72], ['hold', 'RJ', 14], ['when', hits(1)]],
    [['go', 9.6], ['when', (s) => s.frame >= 252], ['hold', 'RJ', 14], ['when', hits(2)]],
    [['go', 16.6], ['when', (s) => s.frame >= 432], ['hold', 'RJ', 14], ['when', hits(3)], ['go', 22.5]],
  ],
  // 裂け目の主：4か所に、ひとりずつ（高い足場へはワープで）
  '裂け目の主': [
    [['go', 3.6], ['hold', 'RJ', 14], ['when', hits(1)]],
    [['go', 3.6], ['when', hits(1)], ['hold', 'RJ', 16], ['holdUntil', 'R', (s) => px(s) > s.boss.x + 56 + 30 && s.player.onGround],
      ['holdUntil', 'R', (s) => s.player.y < 6 * 32], ['go', 19.7], ['hold', 'LJ', 14], ['when', hits(2)]],
    [['go', 3.6], ['when', hits(1)], ['hold', 'RJ', 16], ['holdUntil', 'R', (s) => px(s) > s.boss.x + 56 + 30 && s.player.onGround],
      ['go', 9.9], ['when', (s) => s.frame >= 283], ['hold', 'RJ', 14], ['when', hits(3)]],
    [['holdUntil', 'L', (s) => s.player.y < 6 * 32], ['when', (s) => s.frame >= 433], ['go', 6.2], ['hold', 'LJ', 14],
      ['when', hits(4)], ['go', 1.5]],
  ],
};
