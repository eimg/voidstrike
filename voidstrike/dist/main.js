import { createRenderer } from './renderer.js';
import { createGame, flightBounds } from './game.js';
import { createAudio } from './audio.js';

const game = createGame();
const { state } = game;
const $ = id => document.getElementById(id);
const field = $('field');
const steerPad = $('steer-pad');
const touchNova = $('touch-nova');
const renderer = createRenderer($('scene'), game.setViewScale);
const audio = createAudio();
const pressed = new Set();
const input = {dx:0,dy:0,target:null,burst:false};
const demoMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const stageNames = ['ဝင်ပေါက်', 'အပျက်အစီးဇုန်', 'Warden'];
const modules = {
  pulse: {name:'Twin Pulse', short:'Pulse'},
  spread: {name:'Scatter Array', short:'Scatter'},
  ion: {name:'Ion Lance', short:'Ion'},
  arc: {name:'Arc Coil', short:'Arc'}
};
const pad = n => String(n).padStart(2, '0');
const points = n => String(n).padStart(6, '0');
const runtime = n => pad(Math.floor(n / 60)) + ':' + pad(Math.floor(n % 60));
function saved(key, fallback) { try { return localStorage.getItem('voidstrike.' + key) ?? fallback; } catch { return fallback; } }
function save(key, value) { try { localStorage.setItem('voidstrike.' + key, value); } catch {} }
let record = Math.max(0, Number(saved('best','0')) || 0);
let audioOn = saved('audio','on') !== 'off';
let steering = null, burstTap = false, notifyTimer = 0;
let previousMode, previousWeapons, previousLives, previousStage;
let lastFrame = 0, hudTimer = 0;
const upgradeRows = document.querySelectorAll('.pickup-row[data-weapon]');
const routeSteps = Array.from($('route').children);
const scoreEl = $('score'), clockEl = $('clock'), compactScore = $('compact-score');
$('best').textContent = points(record);
const setText = (node, value) => { if (node.textContent !== value) node.textContent = value; };
function setIcon(el, symbol) { el.querySelector('use').setAttribute('href', '#i-' + symbol); }
function audioUI() {
  $('audio').setAttribute('aria-pressed', String(audioOn));
  $('audio').querySelector('span').textContent = audioOn ? 'အသံဖွင့်ထား' : 'အသံပိတ်ထား';
  setIcon($('audio'), audioOn ? 'volume' : 'mute');
}
audioUI();
if (!audioOn) audio.setEnabled(false);

function clearInput() {
  pressed.clear();
  stopSteering();
  input.burst = false;
  burstTap = false;
}
function action() {
  if (audioOn) audio.unlock();
  clearInput();
  if (state.mode === 'paused') game.resume();
  else if (state.mode !== 'playing') game.start();
  field.focus({preventScroll:true});
  refreshHUD();
}
function togglePause() {
  if (state.mode === 'playing') { clearInput(); game.pause(); }
  else if (state.mode === 'paused') action();
}
function toggleAudio() {
  audioOn = !audioOn;
  audio.setEnabled(audioOn);
  save('audio', audioOn ? 'on' : 'off');
  audioUI();
}
async function fullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch { showNotice('မျက်နှာပြင်အပြည့် ဖွင့်၍မရပါ'); }
}
if (!document.fullscreenEnabled) $('fullscreen').hidden = true;
document.addEventListener('fullscreenchange', () => {
  const full = Boolean(document.fullscreenElement);
  const label = full ? 'မျက်နှာပြင်အပြည့်မှ ထွက်ရန်' : 'မျက်နှာပြင်အပြည့် ဖွင့်ရန်';
  $('fullscreen').setAttribute('aria-label',label);
  $('fullscreen').title = label + ' (F)';
  setIcon($('fullscreen'),full ? 'collapse' : 'expand');
});
$('fullscreen').addEventListener('click', fullscreen);
$('audio').addEventListener('click', toggleAudio);
$('launch').addEventListener('click', action);
$('pause').addEventListener('click', togglePause);
function triggerNova() {
  if (state.mode !== 'playing' || state.burstCooldown > 0) return;
  burstTap = true;
  field.focus({preventScroll:true});
}
for (const button of [$('nova'), touchNova]) {
  // A second finger can fire while the first still owns the steering pointer.
  button.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    event.preventDefault();
    triggerNova();
  });
  button.addEventListener('click', event => {
    if (event.detail === 0) triggerNova();
  });
}
const moveKeys = ['ArrowUp','ArrowLeft','ArrowDown','ArrowRight','KeyW','KeyA','KeyS','KeyD'];
document.addEventListener('keydown', event => {
  if (event.metaKey || event.altKey || event.ctrlKey) return;
  const k = event.code;
  if (moveKeys.includes(k) || k === 'Space') {
    if (state.mode !== 'playing') return;
    event.preventDefault(); pressed.add(k); return;
  }
  if (event.repeat) return;
  if (k === 'KeyP' || k === 'Escape') { togglePause(); return; }
  if (k === 'KeyM') toggleAudio();
  if (k === 'KeyF' && document.fullscreenEnabled) fullscreen();
  if (k === 'Enter' && state.mode !== 'playing' && !event.target.closest('button')) { event.preventDefault(); action(); }
});
document.addEventListener('keyup', e => pressed.delete(e.code));
function suspendFlight() {
  clearInput();
  if (state.mode === 'playing') game.pause();
}
window.addEventListener('blur', suspendFlight);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) suspendFlight();
  lastFrame = 0;
});
const orientation = window.matchMedia('(orientation: landscape)');
function orientationChanged() {
  if (steerPad.offsetWidth > 0 || window.matchMedia('(pointer: coarse)').matches) suspendFlight();
}
if (orientation.addEventListener) orientation.addEventListener('change', orientationChanged);
else orientation.addListener(orientationChanged);

function stopSteering() {
  const previous = steering;
  steering = null;
  input.target = null;
  steerPad.dataset.active = 'false';
  if (previous && previous.surface.hasPointerCapture(previous.id)) {
    previous.surface.releasePointerCapture(previous.id);
  }
}
function pointerPosition(event) {
  const r = field.getBoundingClientRect();
  return {x: (event.clientX - r.left) / r.width * 10 - 5, y: (r.bottom - event.clientY) / r.height * 15};
}
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
function beginSteering(event) {
  if (state.mode !== 'playing' || steering || event.button !== 0 || event.target.closest('button')) return;
  event.preventDefault();
  const surface = event.currentTarget;
  const onPad = surface === steerPad;
  const relative = onPad || event.pointerType === 'touch';
  const {width,height} = surface.getBoundingClientRect();
  surface.focus({preventScroll:true});
  surface.setPointerCapture(event.pointerId);
  // The pad maps a comfortable thumb stroke to the ship's full travel. Direct
  // drags on the flight display retain their closer, screen-relative response.
  steering = {
    id:event.pointerId, surface, relative, lastX:event.clientX, lastY:event.clientY,
    gainX:onPad ? (flightBounds.right - flightBounds.left) / clamp(width * .72, 96, 190) : 12 / width,
    gainY:onPad ? (flightBounds.top - flightBounds.bottom) / clamp(height * 1.3, 88, 160) : 18 / height
  };
  input.target = relative ? {x:state.player.x, y:state.player.y} : pointerPosition(event);
  steerPad.dataset.active = String(onPad);
}
function moveSteering(event) {
  if (steering?.id !== event.pointerId || steering.surface !== event.currentTarget) return;
  if (!steering.relative) {
    input.target = pointerPosition(event);
    return;
  }
  // Accumulate clamped increments so reversing a drag at an edge acts immediately.
  input.target.x = clamp(input.target.x + (event.clientX - steering.lastX) * steering.gainX, flightBounds.left, flightBounds.right);
  input.target.y = clamp(input.target.y - (event.clientY - steering.lastY) * steering.gainY, flightBounds.bottom, flightBounds.top);
  steering.lastX = event.clientX;
  steering.lastY = event.clientY;
}
function endSteering(event) {
  if (steering?.id === event.pointerId && steering.surface === event.currentTarget) stopSteering();
}
for (const surface of [field, steerPad]) {
  surface.addEventListener('pointerdown', beginSteering);
  surface.addEventListener('pointermove', moveSteering);
  for (const type of ['pointerup','pointercancel','lostpointercapture']) surface.addEventListener(type, endSteering);
}

function showNotice(text) {
  const el = $('notify');
  el.textContent = text;
  el.classList.add('visible');
  clearTimeout(notifyTimer);
  notifyTimer = setTimeout(() => el.classList.remove('visible'), 1600);
}
function modeUI() {
  const mode = state.mode;
  const statuses = {ready:'အသင့်',playing:'ပျံသန်းဆဲ',paused:'ခဏရပ်ထား',lost:'အဆက်အသွယ်ပြတ်',won:'ဇုန်ရှင်းပြီ'};
  $('status').textContent = statuses[mode];
  document.querySelector('.playzone').dataset.mode = mode;
  $('pause').disabled = mode !== 'playing' && mode !== 'paused';
  setIcon($('pause'),mode === 'paused' ? 'play' : 'pause');
  const pauseLabel = mode === 'paused' ? 'ဆက်ကစားရန်' : 'ခဏရပ်ရန်';
  $('pause').setAttribute('aria-label',pauseLabel);
  $('pause').title = pauseLabel + ' (P)';
  $('overlay').hidden = mode === 'playing';
  $('overlay').classList.toggle('ready',mode === 'ready');
  $('overlay').querySelector('.message').hidden = mode === 'ready';
  $('nova').hidden = mode !== 'playing';
  steerPad.setAttribute('aria-disabled', String(mode !== 'playing'));
  if (mode !== 'playing') stopSteering();
  if (mode === 'playing') return;
  const message = {
    ready:['','','','စတင်ပျံသန်းရန်'],
    paused:['ပျံသန်းမှု','ခဏရပ်ထားသည်','အမှတ် ' + points(state.score) + ' · ကြာချိန် ' + runtime(state.elapsed),'ဆက်ကစားရန်'],
    won:['တာဝန်ပြီးမြောက်ပြီ','အောင်ပွဲ','Warden ကို ချေမှုန်းလိုက်ပြီ။','ထပ်ကစားရန်'],
    lost:['တာဝန်မအောင်မြင်ပါ','အသက်ကုန်သွားပြီ','', 'ပြန်ကြိုးစားရန်']
  }[mode];
  $('result-label').textContent = message[0];
  $('result-title').textContent = message[1];
  $('result-detail').textContent = mode === 'won' || mode === 'lost'
    ? (message[2] ? message[2] + ' ' : '') + 'အမှတ် ' + points(state.score) + ' · ရန်သူ ' + state.kills + ' စီး ချေမှုန်းခဲ့သည်'
    : message[2];
  $('launch-label').textContent = message[3];
}
function weaponUI(weapons) {
  const combined = weapons.length > 1;
  const list = $('compact-weapon');
  const names = weapons.map(kind => modules[kind].name).join(' + ');
  list.setAttribute('aria-label', 'တပ်ဆင်ထားသည့် လက်နက်များ — ' + names);
  list.title = names;
  list.replaceChildren(...weapons.map(kind => {
    const tag = document.createElement('span');
    tag.className = 'weapon-tag ' + kind;
    tag.lang = 'en';
    tag.textContent = combined ? modules[kind].short : modules[kind].name;
    tag.title = modules[kind].name;
    return tag;
  }));
  for (const row of upgradeRows) {
    const kind = row.dataset.weapon;
    const equipped = weapons.includes(kind);
    row.classList.toggle('equipped', equipped);
    row.setAttribute('aria-label', modules[kind].name + (equipped ? ' တွဲတပ်ထားသည်' : ' ကောက်ယူနိုင်သည်'));
    row.title = equipped ? 'တွဲတပ်ထားသည်' : 'ကောက်ယူနိုင်သည်';
  }
}
function refreshHUD() {
  if (previousMode !== state.mode) { previousMode = state.mode; modeUI(); }
  if (previousWeapons !== state.player.weapons) {
    previousWeapons = state.player.weapons;
    weaponUI(previousWeapons);
  }
  if (previousStage !== state.stageIndex) {
    previousStage = state.stageIndex;
    const stageN = pad(state.stageIndex+1);
    $('sector').textContent = 'ဇုန် ' + stageN;
    $('run-stage').textContent = stageN + ' / 03';
    routeSteps.forEach((li,i) => { li.classList.toggle('current',i === state.stageIndex); li.classList.toggle('done',i < state.stageIndex); });
  }
  if (previousLives !== state.lives) {
    previousLives = state.lives;
    for (const indicator of [$('lives'), $('compact-lives')]) {
      indicator.textContent = '♥'.repeat(state.lives) + '♡'.repeat(state.maxLives - state.lives);
      indicator.setAttribute('aria-label', 'အသက် ' + state.lives + ' ခု ကျန်');
    }
  }
  setText(scoreEl, points(state.score)); setText(compactScore, points(state.score)); setText(clockEl, runtime(state.elapsed));
  const cooldown = Math.ceil(state.burstCooldown);
  const chargeLabel = cooldown ? cooldown + ' စက္ကန့်' : 'အသင့်';
  setText($('burst-status'),chargeLabel);
  setText($('nova-label'),'Nova ' + chargeLabel);
  $('nova').disabled = cooldown > 0;
  setText($('touch-charge'),chargeLabel);
  touchNova.disabled = state.mode !== 'playing' || cooldown > 0;
  $('charge').style.width = (1-state.burstCooldown/state.burstDuration)*100 + '%';
  $('boss-hud').hidden = state.bossHp <= 0 || state.mode !== 'playing';
  if (state.bossHp > 0) {
    $('boss-health').value = state.bossHp/state.bossMaxHp;
    setText($('boss-percent'), Math.ceil(100*state.bossHp/state.bossMaxHp) + '%');
  }
}
game.onEvent = (name, detail) => {
  audio.play(name,detail);
  if (name === 'hit') {
    if (detail.lives > 0) {
      if (steering) input.target = {x:state.player.x, y:state.player.y};
      showNotice('အသက်တစ်ခု ဆုံးရှုံးပြီ · ' + detail.lives + ' ခု ကျန်');
    } else stopSteering();
  }
  if (name === 'pickup') {
    if (detail.kind === 'life') {
      showNotice(detail.applied ? 'အသက်တစ်ခု ထပ်ရပြီ' : 'အသက်ပြည့်နေပြီ');
    } else {
      showNotice(modules[detail.kind].name + (detail.applied ? ' တပ်ဆင်ပြီး' : ' · အပိုအမှတ်ရပြီ'));
    }
  }
  if (name === 'stage') showNotice(detail.index === 2 ? 'သတိ! Warden ချဉ်းကပ်လာပြီ' : stageNames[detail.index]);
  if (name === 'start' || name === 'won' || name === 'lost') { clearTimeout(notifyTimer); $('notify').classList.remove('visible'); }
  if (name === 'won' || name === 'lost') {
    record = Math.max(record,state.score);
    save('best', String(record));
    $('best').textContent = points(record);
  }
  if (['start','pause','resume','won','lost'].includes(name)) refreshHUD();
};
function frame(now) {
  const dt = lastFrame ? Math.min((now-lastFrame)/1000,.1) : 0;
  lastFrame = now;
  if (!document.hidden) {
    input.dx = Number(pressed.has('KeyD') || pressed.has('ArrowRight')) - Number(pressed.has('KeyA') || pressed.has('ArrowLeft'));
    input.dy = Number(pressed.has('KeyW') || pressed.has('ArrowUp')) - Number(pressed.has('KeyS') || pressed.has('ArrowDown'));
    input.burst = burstTap || pressed.has('Space');
    burstTap = false;
    const idleStill = state.mode === 'ready' && demoMotion.matches;
    if (!idleStill) game.update(dt,input);
    renderer.render(state,dt);
    hudTimer += dt;
    if (hudTimer >= .075) { hudTimer = 0; refreshHUD(); }
  }
  requestAnimationFrame(frame);
}

// A local navigation chart shows the flight route against the planet's graticule.
function drawChart() {
  const canvas = $('chart'), ctx = canvas.getContext('2d');
  const w = 280, h = 87;
  canvas.width = w*2; canvas.height = h*2;
  ctx.scale(2,2);
  const line = (x1,y1,x2,y2,color) => {ctx.strokeStyle=color;ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();};
  ctx.lineWidth=.6;
  for (let x=4;x<w;x+=12) for (let y=4;y<h;y+=12) {ctx.fillStyle='#48505b';ctx.fillRect(x,y,.75,.75);}
  ctx.save();ctx.translate(79,48);ctx.rotate(-.28);
  const radius=32;
  ctx.strokeStyle='#626c70';ctx.lineWidth=.65;
  ctx.beginPath();ctx.arc(0,0,radius,0,Math.PI*2);ctx.stroke();
  for (const sx of [.24,.54,.82]) {ctx.beginPath();ctx.ellipse(0,0,radius*sx,radius,0,0,Math.PI*2);ctx.stroke();}
  for(let i=-2;i<=2;i++){const y=i*10;const rx=Math.sqrt(radius*radius-y*y);ctx.beginPath();ctx.ellipse(0,y,rx,rx*.13,0,0,Math.PI*2);ctx.stroke();}
  ctx.strokeStyle='#c9845c';ctx.beginPath();ctx.ellipse(0,0,62,12,-.13,0,Math.PI*2);ctx.stroke();
  ctx.restore();
  const nodes=[[110,38],[153,33],[172,18],[227,18],[246,30]];
  ctx.strokeStyle='#a66f51';ctx.setLineDash([3,3]);ctx.beginPath();nodes.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.stroke();ctx.setLineDash([]);
  for (const [x,y] of nodes.slice(1)){ctx.fillStyle='#e18a5d';ctx.fillRect(x-1.5,y-1.5,3,3);}
  for (const [x,y] of [[12,64],[253,61],[32,11]]){line(x-3,y,x+3,y,'#6a757b');line(x,y-3,x,y+3,'#6a757b');}
  for(let i=0;i<18;i++) line(180+i*3,70,180+i*3,70-(i%5===0?5:2),'#586068');
}
drawChart();
refreshHUD();
requestAnimationFrame(frame);
