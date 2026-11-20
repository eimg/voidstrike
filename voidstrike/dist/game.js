const BOSS_ARRIVAL = 66;
const FIELD_ENTRY = 32;
const FIRST_WAVE_INTERVAL = 3.55;
const BURST_RECHARGE = 11;
const STARTING_LIVES = 3;
const SPAWN_X = 0, SPAWN_Y = 2.8;
export const flightBounds = Object.freeze({left: -4.42, right: 4.42, bottom: 0.91, top: 13.25});
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const enemyStats = {
  scout:   { hp: 3, points: 120, rx: 0.40, ry: 0.40 },
  striker: { hp: 7, points: 240, rx: 0.52, ry: 0.48 },
  brute:   { hp: 19, points: 460, rx: 0.76, ry: 0.61 },
  boss:    { hp: 480, points: 3500, rx: 1.62, ry: 0.85 }
};
const weapons = {
  pulse:  { interval: 0.23, speed: 16, damage: 1 },
  spread: { interval: 0.44, speed: 15, damage: 1.2 },
  ion:    { interval: 0.58, speed: 23, damage: 7.4 },
  arc:    { interval: 0.36, speed: 17, damage: 2.2 }
};

const flights = [
  ['sweep', 1], ['pincer'], ['wings'], ['convoy'], ['dive', -1],
  ['escort', 1], ['sweep', -1], ['gate', 1], ['pincer'], ['dive', 1],
  ['convoy'], ['gate', -1], ['escort', -1], ['wings'], ['dive', -1],
  ['gate', 1], ['pincer'], ['sweep', 1], ['convoy'], ['dive', 1],
  ['gate', -1], ['escort', 1], ['pincer'], ['dive', -1]
];
const supply = [
  [7, 'spread', -2.7], [25, 'arc', 2.85],
  [38, 'life', -3.1], [48, 'ion', 2.0]
];
const bossSupply = [
  ['spread', -3.05], ['arc', 2.8], ['ion', -2.1]
];

export function createGame() {
  const state = {};
  let nextId = 1;
  let flightIndex, nextFlight, supplyIndex, nextBossSupply, bossSupplyIndex, nextEscort;
  let weaponCooldowns, alternatingGun, velocityX, velocityY, burstHeld;
  let viewX = 1, viewY = 1;
  const game = { state, update, start, pause, resume, reset, setViewScale, onEvent: null };

  function setViewScale(sx, sy) {
    viewX = Number.isFinite(sx) && sx >= 1 ? sx : 1;
    viewY = Number.isFinite(sy) && sy >= 1 ? sy : 1;
  }
  function distanceOnScreen(dx, dy) {
    return Math.hypot(dx * viewX, dy * viewY);
  }

  function event(name, detail = {}) {
    if (typeof game.onEvent === 'function') game.onEvent(name, detail);
  }

  function initialize(mode) {
    Object.assign(state, {
      mode, time: 0, elapsed: 0, pressure: 0, progress: 0, stageIndex: 0, score: 0, kills: 0,
      lives: STARTING_LIVES, maxLives: STARTING_LIVES, burstCooldown: 0, burstDuration: BURST_RECHARGE,
      bossHp: 0, bossMaxHp: 0,
      player: { x: SPAWN_X, y: SPAWN_Y, bank: 0, invulnerable: 0, weapons: ['pulse'], lastShotAt: {} },
      enemies: [], shots: [], pickups: [], effects: []
    });
    flightIndex = supplyIndex = bossSupplyIndex = 0;
    nextFlight = FIRST_WAVE_INTERVAL;
    nextBossSupply = BOSS_ARRIVAL + 13;
    nextEscort = BOSS_ARRIVAL + 5;
    weaponCooldowns = { pulse: 0.18 };
    alternatingGun = velocityX = velocityY = 0;
    burstHeld = false;
  }

  function spawnEnemy(type, x, y = 16, path = 'cruise', phase = 0) {
    const hp = enemyStats[type].hp;
    const enemy = {
      id: nextId++, type, x, y, homeX: x, homeY: y, path, phase, pathTime: 0,
      hp, maxHp: hp, bank: 0, flash: 0, charge: 0, fireCount: 0,
      fireIn: type === 'boss' ? 1.5 : 0.8 + (Math.abs(phase) % 0.85),
      pattern: 'fan', aimX: 0, aimY: 0, locked: false
    };
    state.enemies.push(enemy);
    return enemy;
  }

  function spawnFlight(name, side = 1) {
    const add = spawnEnemy;
    switch (name) {
      case 'opening':
        add('scout', 0, 11.7);
        add('striker', -2.7, 12.5, 'guard', -0.4);
        add('striker', 2.7, 13.2, 'guard', 0.7);
        break;
      case 'sweep':
        for (let i = 0; i < 4; i++) {
          add('scout', side * (3.6 - i * 0.4), 15.6 + i * 0.92, 'sweep', side);
        }
        break;
      case 'wings':
        for (let i = -2; i <= 2; i++) {
          add('scout', i * 1.6, 15.4 + Math.abs(i) * 0.65, 'cruise', i * 0.43);
        }
        break;
      case 'pincer':
        add('striker', -2.8, 15.5, 'guard', -0.5);
        add('striker', 2.8, 16.1, 'guard', 0.6);
        add('scout', 0, 17.1, 'cruise');
        break;
      case 'convoy':
        add('brute', 0, 16.5, 'guard');
        add('scout', -2.15, 15.6, 'cruise', -0.5);
        add('scout', 2.15, 15.6, 'cruise', 0.5);
        break;
      case 'escort':
        add('brute', side * 2.2, 16.2, 'guard', side);
        add('striker', side * -1.1, 15.9, 'guard', -side);
        add('scout', side * -3.0, 16.85, 'cruise');
        break;
      case 'dive':
        for (let i = 0; i < 3; i++) {
          add('striker', side * (3.8 - i * 0.6), 15.6 + i * 0.85, 'dive', side);
        }
        break;
      case 'gate':
        // Four synchronized firing lanes leave one visible opening in the curtain.
        for (let lane = -2; lane <= 2; lane++) {
          if (lane !== side) add('scout', lane * 1.85, 15.65, 'gate');
        }
        break;
    }
  }

  function pickup(kind, x, y) {
    const id = nextId++;
    state.pickups.push({ id, kind, x, y, homeX: x, homeY: y, age: 0, phase: x * 0.75 });
  }

  function shot(kind, x, y, vx, vy, damage = 1) {
    const bullet = { id: nextId++, kind, x, y, vx, vy, damage, angle: Math.atan2(-vx, vy) };
    if (kind === 'ion') bullet.pierced = new Set();
    state.shots.push(bullet);
    return bullet;
  }

  function effect(kind, x, y, duration, size = 1, end = null) {
    const fx = { id: nextId++, kind, x, y, age: 0, duration, size };
    if (end) { fx.x2 = end.x; fx.y2 = end.y; }
    state.effects.push(fx);
    return fx;
  }

  function reset() {
    initialize('ready');
    const p = state.player;
    p.x = -0.35;
    p.y = 3.1;
    spawnEnemy('striker', -2.75, 10.65, 'idle', 0.0);
    spawnEnemy('striker', 2.57, 10.40, 'idle', 1.2);
    spawnEnemy('brute', 0.6, 12.4, 'idle', 2);
    spawnEnemy('scout', -0.52, 8.75, 'idle', 3.1);
    pickup('arc', 1.74, 6.6);
    pickup('ion', -2.45, 5.9);
    for (let i = 0; i < 2; i++) {
      for (const side of [-1, 1]) {
        const s = shot('pulse', p.x + side * 0.39, 4.08 + i * 2.24, 0, 11);
        s.demoPhase = 0.50 + i * 2.24;
        s.demoSide = side;
      }
    }
    for (const [x, y] of [[-2.7, 9.25], [2.65, 8.9], [-0.5, 7.0]]) {
      Object.assign(shot('enemy', x, y, 0, -3.4), { homeX: x, homeY: y });
    }
  }

  function start() {
    initialize('playing');
    spawnFlight('opening');
    event('start');
  }
  function pause() {
    if (state.mode === 'playing') { state.mode = 'paused'; event('pause'); }
  }
  function resume() {
    if (state.mode === 'paused') { state.mode = 'playing'; event('resume'); }
  }

  function idle() {
    const p = state.player, t = state.time;
    p.x = -0.35 + Math.sin(t * 0.55) * 0.16;
    p.y = 3.1 + Math.sin(t * 0.78) * 0.07;
    p.bank = Math.cos(t * 0.55) * 0.075;
    for (const e of state.enemies) {
      e.x = e.homeX + Math.sin(t * 0.47 + e.phase) * 0.13;
      e.y = e.homeY + Math.sin(t * 0.69 + e.phase) * 0.15;
      e.bank = Math.cos(t * 0.47 + e.phase) * 0.08;
    }
    for (const pack of state.pickups) pack.y = pack.homeY + Math.sin(t * 0.87 + pack.phase) * 0.14;
    for (const s of state.shots) {
      if (s.kind === 'pulse') {
        s.y = p.y + 0.48 + (s.demoPhase + t * 2.9) % 4.48;
        s.x = p.x + s.demoSide * 0.39 / viewX;
      } else {
        s.y = s.homeY - (t * 0.95) % 1.65;
        s.x = s.homeX + Math.sin(t * 0.47) * 0.1;
      }
    }
  }

  function movePlayer(dt, input) {
    const p = state.player;
    let dx = clamp(Number(input.dx) || 0, -1, 1);
    let dy = clamp(Number(input.dy) || 0, -1, 1);
    const length = Math.hypot(dx, dy);
    if (length > 1) { dx /= length; dy /= length; }
    let desiredX = dx * 8.3, desiredY = dy * 8.3;
    if (input.target && !length) {
      const toX = clamp(input.target.x, flightBounds.left, flightBounds.right) - p.x;
      const toY = clamp(input.target.y, flightBounds.bottom, flightBounds.top) - p.y;
      const scale = Math.min(23, 15 / Math.max(0.01, Math.hypot(toX, toY)));
      desiredX = toX * scale;
      desiredY = toY * scale;
    }
    const ease = 1 - Math.exp(-19 * dt);
    velocityX += (desiredX - velocityX) * ease;
    velocityY += (desiredY - velocityY) * ease;
    p.x = clamp(p.x + velocityX * dt, flightBounds.left, flightBounds.right);
    p.y = clamp(p.y + velocityY * dt, flightBounds.bottom, flightBounds.top);
    p.bank += (clamp(velocityX / 8.3, -1, 1) - p.bank) * (1 - Math.exp(-12 * dt));
    p.invulnerable = Math.max(0, p.invulnerable - dt);
  }

  function firePlayer(kind) {
    const p = state.player;
    const { speed, damage, interval } = weapons[kind];
    if (kind === 'pulse') {
      for (const side of [-1, 1]) shot('pulse', p.x + side * 0.39 / viewX, p.y + 0.27 / viewY, 0, speed, damage);
    } else if (kind === 'spread') {
      for (let i = -2; i <= 2; i++) {
        const a = i * 0.17;
        shot('spread', p.x + i * 0.16 / viewX, p.y + 0.38 / viewY, Math.sin(a) * speed, Math.cos(a) * speed, damage);
      }
    } else if (kind === 'ion') {
      shot('ion', p.x, p.y + 0.70 / viewY, 0, speed, damage);
    } else {
      alternatingGun = 1 - alternatingGun;
      const x = p.x + (alternatingGun ? -0.53 : 0.53) / viewX;
      let target = null, distance = 8;
      for (const e of state.enemies) {
        const d = distanceOnScreen(e.x - x, e.y - p.y);
        if (e.y > p.y + 0.5 && Math.abs(e.x - x) * viewX < 2.5 && d < distance && !e.dead) {
          target = e; distance = d;
        }
      }
      const a = target ? clamp(Math.atan2(target.x - x, target.y - p.y), -0.45, 0.45) : 0;
      shot('arc', x, p.y - 0.04 / viewY, Math.sin(a) * speed, Math.cos(a) * speed, damage);
    }
    p.lastShotAt[kind] = state.time;
    weaponCooldowns[kind] += interval;
    event('shot', { kind, weaponCount: p.weapons.length });
  }

  function fireEnemy(e) {
    const p = state.player;
    const shotSpeed = 1 + 0.26 * state.pressure;
    const aim = (x, y, targetX, targetY, speed, type = 'enemy') => {
      const distance = Math.hypot(targetX - x, targetY - y) || 1;
      const scale = speed * shotSpeed / distance;
      shot(type, x, y, (targetX - x) * scale, (targetY - y) * scale);
    };
    const fan = (x, y, count, step, angle, speed, type = 'enemy') => {
      for (let i = 0; i < count; i++) {
        const a = angle + (i - (count - 1) / 2) * step;
        shot(type, x, y, Math.sin(a) * speed * shotSpeed, -Math.cos(a) * speed * shotSpeed);
      }
    };
    if (e.type === 'boss') {
      const phase = e.hp > e.maxHp * 0.68 ? 0 : e.hp > e.maxHp * 0.34 ? 1 : 2;
      if (e.pattern === 'lock') {
        for (const side of [-1, 1]) {
          aim(e.x + side * 1.13 / viewX, e.y - 0.45 / viewY, e.aimX, e.aimY, 6.2, 'heavy');
          fan(e.x + side * 1.13 / viewX, e.y - 0.45 / viewY, 2, 0.29, side * 0.26, 3.65);
          if (phase === 2) aim(e.x + side * 1.13 / viewX, e.y - 0.45 / viewY, e.aimX + side * 1.45, e.aimY, 5.1);
        }
        e.fireIn = 1.42;
      } else if (e.pattern === 'spiral') {
        const angle = Math.sin(e.fireCount * 0.74) * 0.38;
        fan(e.x, e.y - 0.65 / viewY, 7 + phase, 0.22, angle, 4.35);
        e.fireIn = 0.89;
      } else {
        const offset = e.fireCount % 2 ? 0.055 : -0.055;
        for (const side of [-1, 1]) {
          fan(e.x + side * 1.13 / viewX, e.y - 0.48 / viewY, 5 + phase, 0.22, -side * 0.27 + offset, 4.05);
        }
        e.fireIn = 1.77;
      }
      e.fireCount++;
      const section = e.fireCount % 8;
      if (section < 2) e.pattern = 'fan';
      else if (section < 4) e.pattern = 'lock';
      else if (phase > 0) e.pattern = 'spiral';
      else e.pattern = section < 7 ? 'fan' : 'lock';
      if (section === 0 || section === 4) e.fireIn += 0.45;
    } else if (e.type === 'brute') {
      const count = state.pressure >= 0.55 ? 7 : 5;
      fan(e.x, e.y - 0.4 / viewY, count, 0.22, e.fireCount % 2 ? 0.1 : -0.1, 4.0);
      e.fireIn = 1.95;
    } else if (e.type === 'striker') {
      aim(e.x, e.y - 0.35 / viewY, e.aimX, e.aimY, 5.1);
      e.fireIn = e.path === 'dive' ? 2.4 : 1.65;
    } else if (e.path === 'gate') {
      for (const side of [-1, 1]) shot('enemy', e.x + side * 0.23 / viewX, e.y - 0.29 / viewY, 0, -4.7 * shotSpeed);
      e.fireIn = 2.15;
    } else if (e.fireCount % 3 === 0) {
      aim(e.x, e.y - 0.29 / viewY, p.x, p.y, 4.15);
      e.fireIn = 2.2;
    } else {
      shot('enemy', e.x, e.y - 0.29 / viewY, 0, -4.65 * shotSpeed);
      e.fireIn = 2.2;
    }
    if (e.type !== 'boss') e.fireCount++;
    e.fireIn = Math.max(0.6, e.fireIn / (1 + 0.55 * state.pressure));
    e.locked = false;
    e.charge = 0;
  }

  function moveEnemies(dt) {
    const travel = dt * (1 + 0.27 * state.pressure);
    for (const e of state.enemies) {
      const previousX = e.x;
      e.pathTime += travel;
      e.flash = Math.max(0, e.flash - dt * 7);
      if (e.type === 'boss') {
        e.x = Math.sin(e.pathTime * 0.53) * 2.63 * Math.min(1, e.pathTime * 0.34);
        const settledY = 11.95 + Math.sin(e.pathTime * 0.87) * 0.38;
        e.y += (settledY - e.y) * (1 - Math.exp(-1.1 * travel));
      } else if (e.path === 'guard') {
        e.x = e.homeX + Math.sin(e.pathTime * (e.type === 'brute' ? 0.58 : 0.97) + e.phase) * 0.88;
        const target = (e.type === 'brute' ? 10.85 : 9.65) + Math.sin(e.pathTime + e.phase) * 0.4;
        if (e.pathTime < 7.2) e.y = Math.max(target, e.y - travel * 3.2);
        else e.y -= travel * 2.7;
      } else if (e.path === 'dive') {
        e.x = e.homeX - e.phase * Math.min(6.6, e.pathTime * 1.2);
        e.y -= 2.55 * travel;
      } else if (e.path === 'gate') {
        e.y -= 1.72 * travel;
      } else if (e.path === 'sweep') {
        e.y -= 1.52 * travel;
        e.x = e.homeX - e.phase * 3.2 * (1 - Math.cos(e.pathTime * 0.51));
      } else {
        e.y -= 1.65 * travel;
        e.x = e.homeX + Math.sin(e.pathTime * 0.93 + e.phase) * 0.56;
      }
      e.bank = clamp((e.x - previousX) / Math.max(dt * 5, 0.001), -0.65, 0.65);
      if (e.y < -1) { e.dead = true; continue; }
      if (e.y > 14.7 || e.y < 1.8) continue;
      // No unannounced point-blank shots. Strikers otherwise cover both sides
      // of their formation, including pilots flying above the escort line.
      if (distanceOnScreen(e.x - state.player.x, e.y - state.player.y) < 1.55) continue;
      if (e.type === 'scout' && e.y < state.player.y + 0.5) continue;
      e.fireIn -= dt;
      e.charge = clamp(1 - e.fireIn / 0.62, 0, 1);
      if ((e.type === 'striker' || e.pattern === 'lock') && e.charge > 0.12 && !e.locked) {
        e.aimX = state.player.x;
        e.aimY = state.player.y;
        e.locked = true;
      }
      if (e.fireIn <= 0) fireEnemy(e);
    }
  }

  function hurtPlayer() {
    const p = state.player;
    if (p.invulnerable > 0 || state.lives === 0) return;
    const {x, y} = p;
    state.lives--;
    p.weapons = ['pulse'];
    p.lastShotAt = {};
    weaponCooldowns = { pulse: 0.18 };
    alternatingGun = 0;
    effect('explosion', x, y, 0.85, 1.6);
    if (state.lives > 0) {
      p.x = SPAWN_X;
      p.y = SPAWN_Y;
      p.bank = velocityX = velocityY = 0;
      p.invulnerable = 2;
      for (const s of state.shots) {
        if ((s.kind === 'enemy' || s.kind === 'heavy') && distanceOnScreen(s.x - p.x, s.y - p.y) < 2) s.dead = true;
      }
    }
    event('hit', { x, y, lives: state.lives });
  }

  function damage(e, amount) {
    if (e.dead) return;
    e.hp = Math.max(0, e.hp - amount);
    e.flash = 1;
    if (e.type === 'boss') state.bossHp = e.hp;
    if (e.hp > 0) return;
    e.dead = true;
    const points = enemyStats[e.type].points;
    state.score += points;
    state.kills++;
    const size = { scout: 0.72, striker: 0.95, brute: 1.3, boss: 2.5 }[e.type];
    effect('explosion', e.x, e.y, 0.53 + size * 0.17, size);
    if (e.type === 'boss') {
      effect('burst', e.x, e.y, 0.88, 1.5);
      for (const side of [-1, 1]) effect('explosion', e.x + side * 1.12 / viewX, e.y - 0.13 / viewY, 0.92, 1.3);
    }
    event('kill', { type: e.type, x: e.x, y: e.y, points });
  }

  function chain(from, amount) {
    const struck = [from];
    let origin = from;
    for (let jump = 0; jump < 3; jump++) {
      let target = null, distance = 3.75;
      for (const e of state.enemies) {
        const d = distanceOnScreen(e.x - origin.x, e.y - origin.y);
        if (!e.dead && !struck.includes(e) && d < distance) { target = e; distance = d; }
      }
      if (!target) break;
      effect('arc', origin.x, origin.y, 0.22, 1, target);
      damage(target, amount * Math.pow(0.78, jump + 1));
      struck.push(target);
      origin = target;
    }
  }

  function burst() {
    if (state.burstCooldown > 0) return;
    const p = state.player;
    state.burstCooldown = BURST_RECHARGE;
    p.invulnerable = Math.max(p.invulnerable, 0.65);
    effect('burst', p.x, p.y, 0.62, 1);
    for (const s of state.shots) {
      if (s.kind === 'enemy' || s.kind === 'heavy') s.dead = true;
    }
    for (const e of state.enemies) {
      const distance = distanceOnScreen(e.x - p.x, e.y - p.y);
      if (distance <= 7.1) damage(e, e.type === 'boss' ? 9 : 7);
    }
    event('burst', { kind: 'burst', x: p.x, y: p.y });
  }

  function bullets(dt) {
    const p = state.player;
    for (const s of state.shots) {
      if (s.dead) continue;
      s.x += s.vx * dt; s.y += s.vy * dt;
      if (Math.abs(s.x) > 5.6 || s.y < -0.9 || s.y > 16.4) { s.dead = true; continue; }
      if (s.kind === 'enemy' || s.kind === 'heavy') {
        const r = s.kind === 'heavy' ? 0.2 : 0.105;
        if (((s.x - p.x) * viewX / (0.20 + r)) ** 2 + ((s.y - p.y) * viewY / (0.26 + r)) ** 2 < 1) {
          hurtPlayer();
          s.dead = true;
        }
        continue;
      }
      for (const e of state.enemies) {
        if (e.dead || s.pierced?.has(e.id)) continue;
        const d = enemyStats[e.type];
        const width = s.kind === 'ion' ? 0.17 : 0.09;
        if (((s.x - e.x) * viewX / (d.rx + width)) ** 2 + ((s.y - e.y) * viewY / (d.ry + 0.15)) ** 2 > 1) continue;
        damage(e, s.damage);
        if (!e.dead) effect('hit', s.x, s.y, 0.16, 0.5);
        if (s.kind === 'arc') {
          effect('arc', s.x, s.y - 0.48 / viewY, 0.19, 0.8, e);
          chain(e, s.damage);
        }
        if (s.pierced) s.pierced.add(e.id);
        else { s.dead = true; break; }
      }
    }
    for (const e of state.enemies) {
      if (e.dead) continue;
      const shape = enemyStats[e.type];
      if (((e.x - p.x) * viewX / (shape.rx + 0.14)) ** 2 + ((e.y - p.y) * viewY / (shape.ry + 0.2)) ** 2 > 1) continue;
      if (p.invulnerable <= 0 && state.lives > 0) { hurtPlayer(); damage(e, e.type === 'boss' ? 1 : 3); }
    }
  }

  function supplies(dt) {
    const p = state.player;
    for (const pack of state.pickups) {
      pack.age += dt;
      pack.y -= 1.65 * dt;
      pack.x = pack.homeX + Math.sin(pack.age * 0.95 + pack.phase) * 0.16;
      if (distanceOnScreen(p.x - pack.x, p.y - pack.y) < 0.54) {
        pack.dead = true;
        let applied = false;
        if (pack.kind === 'life') {
          applied = state.lives < state.maxLives;
          if (applied) state.lives++;
        } else if (!p.weapons.includes(pack.kind)) {
          p.weapons = [...p.weapons, pack.kind];
          weaponCooldowns[pack.kind] = 0.06;
          applied = true;
        }
        state.score += 60;
        effect('collect', pack.x, pack.y, 0.58).item = pack.kind;
        event('pickup', { kind: pack.kind, applied, x: pack.x, y: pack.y });
      } else if (pack.y < -0.7) pack.dead = true;
    }
  }

  function ageEffects(dt) {
    for (const e of state.effects) e.age += dt;
    state.effects = state.effects.filter(e => e.age < e.duration);
  }

  function schedule() {
    const t = state.elapsed;
    // Rising fire rates and movement speed share one clock. After the Warden
    // arrives, diminishing gains keep long fights within dodgeable limits.
    const bossTime = Math.max(0, t - BOSS_ARRIVAL);
    state.pressure = Math.min(t / BOSS_ARRIVAL, 1)
      + 0.8 * bossTime / (48 + bossTime);
    while (flightIndex < flights.length && t >= nextFlight) {
      const [name, side] = flights[flightIndex++];
      spawnFlight(name, side);
      nextFlight += FIRST_WAVE_INTERVAL / (1 + 0.85 * state.pressure);
    }
    while (supplyIndex < supply.length && t >= supply[supplyIndex][0]) {
      const [, kind, x] = supply[supplyIndex++];
      pickup(kind, x, 13.6);
    }
    const stage = t >= BOSS_ARRIVAL ? 2 : t >= FIELD_ENTRY ? 1 : 0;
    if (stage !== state.stageIndex) {
      state.stageIndex = stage;
      if (stage === 2) {
        const boss = spawnEnemy('boss', 0, 16.8);
        state.bossHp = state.bossMaxHp = boss.maxHp;
      }
      event('stage', { index: stage });
    }
    if (stage === 2 && t >= nextBossSupply && bossSupplyIndex < bossSupply.length) {
      const [kind, x] = bossSupply[bossSupplyIndex++];
      pickup(kind, x, 13.6);
      nextBossSupply += 22;
    }
    if (stage === 2 && t >= nextEscort) {
      const side = Math.sin(nextEscort) < 0 ? -1 : 1;
      spawnEnemy('striker', side * 3.65, 15.65, 'dive', side);
      spawnEnemy('scout', -side * 3.35, 16.2, 'sweep', -side);
      nextEscort += state.bossHp < state.bossMaxHp * 0.34 ? 7 : 10;
    }
    state.progress = stage < 2 ? t / BOSS_ARRIVAL * 0.8 : 0.8 + 0.2 * (1 - state.bossHp / state.bossMaxHp);
  }

  function step(dt, input) {
    state.time += dt;
    state.elapsed += dt;
    ageEffects(dt);
    schedule();
    movePlayer(dt, input);
    state.burstCooldown = Math.max(0, state.burstCooldown - dt);
    for (const kind of state.player.weapons) {
      weaponCooldowns[kind] -= dt;
      if (weaponCooldowns[kind] <= 0) firePlayer(kind);
    }
    moveEnemies(dt);
    supplies(dt);
    bullets(dt);
    state.shots = state.shots.filter(s => !s.dead);
    state.enemies = state.enemies.filter(e => !e.dead);
    state.pickups = state.pickups.filter(p => !p.dead);
    if (state.lives === 0) {
      state.mode = 'lost';
      event('lost', { score: state.score });
    } else if (state.bossMaxHp > 0 && state.bossHp <= 0) {
      state.progress = 1;
      state.mode = 'won';
      state.score += state.lives * 500;
      state.shots.length = 0;
      event('won', { score: state.score });
    }
  }

  function update(seconds, input = {}) {
    const dt = clamp(Number(seconds) || 0, 0, 0.15);
    if (state.mode === 'paused') return;
    if (state.mode === 'ready') { state.time += dt; idle(); return; }
    if (state.mode !== 'playing') { state.time += dt; ageEffects(dt); return; }
    if (input.burst && !burstHeld) burst();
    burstHeld = Boolean(input.burst);
    const steps = Math.ceil(dt * 90);
    for (let i = 0; i < steps && state.mode === 'playing'; i++) step(dt / steps, input);
  }

  reset();
  return game;
}
