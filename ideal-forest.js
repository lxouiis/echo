// Ideal Forest — images in /images1
// Implements: (1) shared leaderboard helpers, (2) name handler to load points,
// (3) sync back on HUD update, (4) loadSave keepPoints, (5) discrete growth on water only

// ===== Canvas & UI =====
const CANVAS = document.getElementById('world');
const CTX = CANVAS.getContext('2d');

const HUD = {
  trees:  document.getElementById('treeCount'),
  points: document.getElementById('points'),
  wind:   document.getElementById('windCount'),
  boost:  document.getElementById('boost'),
  board:  document.getElementById('board')
};

const UI = {
  plant: document.getElementById('plantBtn'),
  water: document.getElementById('waterBtn'),
  wind:  document.getElementById('buildWindBtn'),
  sell:  document.getElementById('sellTreeBtn'),
  name:  document.getElementById('playerName'),
  save:  document.getElementById('saveBtn')
};

// (Optional) How-to modal — guarded so it never throws if markup missing
const HOW = {
  btn: document.getElementById('howBtn'),
  backdrop: document.getElementById('howBackdrop'),
  close: document.getElementById('howClose')
};
function openHow(){ if(HOW.backdrop){ HOW.backdrop.classList.add('show'); document.body.style.overflow='hidden'; } }
function closeHow(){ if(HOW.backdrop){ HOW.backdrop.classList.remove('show'); document.body.style.overflow=''; } }
if (HOW.btn) HOW.btn.addEventListener('click', openHow);
if (HOW.close) HOW.close.addEventListener('click', closeHow);
if (HOW.backdrop) HOW.backdrop.addEventListener('click', (e)=>{ if(e.target === HOW.backdrop) closeHow(); });
document.addEventListener('keydown', (e)=>{ if(e.key === 'Escape') closeHow(); });

const TOAST = document.getElementById('toast');

// ===== Shared leaderboard (global points) =====
function getSharedPlayers() {
  try { return JSON.parse(localStorage.getItem("ecogame.players") || "[]"); }
  catch { return []; }
}
function saveSharedPlayers(players) {
  try { localStorage.setItem("ecogame.players", JSON.stringify(players)); } catch {}
}
function loadPointsFromShared(name) {
  if (!name) return 0;
  const n = String(name).toLowerCase().trim();
  const p = getSharedPlayers().find(x => (x?.name || "").toLowerCase().trim() === n);
  const v = Number(p?.total);
  return Number.isFinite(v) ? v : 0;
}
function updateSharedPoints(name, newTotal) {
  if (!name) return;
  const n = String(name).toLowerCase().trim();
  const arr = getSharedPlayers();
  const i = arr.findIndex(x => (x?.name || "").toLowerCase().trim() === n);
  const total = Math.max(0, Math.floor(Number(newTotal) || 0));
  if (i >= 0) arr[i].total = total; else arr.push({ name, total });
  saveSharedPlayers(arr);
}

// ===== Costs =====
// set these to 1000 / 500 / 5000 for real play, or 0s for testing
const COST = { tree: 0, water: 0, wind: 0 };

// ===== Assets =====
const AS = {
  bgVid: (() => {
    const v = document.getElementById('bgVid');
    if (v) {
      v.muted = true;
      v.loop = true;
      v.playsInline = true;
      v.play().catch(()=>{});
    }
    return v;
  })(),
  char: img('images1/char.png'),
  t1:   img('images1/tree1.png'),
  t2:   img('images1/tree2.png'),
  t3:   img('images1/tree3.png'),
  wind: img('images1/wind.png')
};
function img(src){ const im = new Image(); im.src = src; return im; }

// ===== World & Player =====
const world = {
  w: CANVAS.width,
  h: CANVAS.height,
  target: { x: CANVAS.width*0.5, y: CANVAS.height*0.7 }
};

const BASE_W = 1280, BASE_H = 720;
function sceneScale(){ return Math.min(world.w/BASE_W, world.h/BASE_H); }

const CHAR_SCALE = 2.2, WIND_SCALE = 1.6, TREE_SCALE = 1.6;

const player = {
  name: 'Player',
  x: CANVAS.width*0.5,
  y: CANVAS.height*0.8,
  speed: 260,
  points: 0,
  wind: 0,
  growthBoost: 1.0,  // still used for any future mechanics, but not for stage ups now
  selected: -1
};

const trees = []; // {x,y,stage}
const winds = []; // {x,y,rot,pps}

// ===== Pointer =====
function lpos(e){
  const r = CANVAS.getBoundingClientRect();
  const sx = CANVAS.width / r.width, sy = CANVAS.height / r.height;
  return { x:(e.clientX - r.left)*sx, y:(e.clientY - r.top)*sy };
}
let pointer = { x: world.target.x, y: world.target.y, down:false };

CANVAS.addEventListener('pointerdown', e => {
  const p = lpos(e);
  pointer = { ...p, down:true };
  world.target = p;
  const k = nearestTree(p.x, p.y, 42);
  player.selected = k;
});
CANVAS.addEventListener('pointermove', e => {
  if(!pointer.down) return;
  const p = lpos(e);
  pointer = { ...p, down:true };
  world.target = p;
});
CANVAS.addEventListener('pointerup', () => { pointer.down = false; });

// ===== UI =====
if (UI.plant) UI.plant.addEventListener('click', () => plant(world.target.x, world.target.y));
if (UI.water) UI.water.addEventListener('click', waterSelected);
if (UI.wind)  UI.wind .addEventListener('click', buildWind);
if (UI.sell)  UI.sell .addEventListener('click', sellSelected);

// (2) Replace the name input handler — loads points from shared store, keeps them when loading layout
if (UI.name) UI.name.addEventListener('change', () => {
  const n = (UI.name.value || '').replace(/\s+/g,' ').trim();
  if (n) {
    player.name = n;
    player.points = loadPointsFromShared(n);
    toast(`Loaded ${player.points} pts from global leaderboard!`);
    loadSave(null, true);     // keepPoints = true
    renderBoard();
    updateHUD();               // sync back to shared store
  }
});
if (UI.save) UI.save.addEventListener('click', () => { save(); toast('Saved!'); });

// ===== Local leaderboard (for this page’s board view only) =====
const LB_KEY='idealforest.lb';
function loadBoard(){ try{return JSON.parse(localStorage.getItem(LB_KEY)||'[]');}catch{return []} }
function saveBoard(a){ try{ localStorage.setItem(LB_KEY, JSON.stringify(a)); }catch{} }
function updateBoard(){
  const a=loadBoard();
  const i=a.findIndex(r=>(r.name||'').toLowerCase()===player.name.toLowerCase());
  const entry={name:player.name, score:Math.floor(player.points), wind:player.wind, trees:trees.length};
  if(i<0) a.push(entry); else a[i]=entry;
  a.sort((x,y)=>y.score-x.score);
  saveBoard(a);
}
function renderBoard(){
  const a=loadBoard();
  if(!a.length){ HUD.board.innerHTML='<p style="opacity:.8">No scores yet. Play to earn points!</p>'; return; }
  HUD.board.innerHTML=a.map((r,i)=>{
    const b1=r.trees?`<span class="badge">🌳 ${r.trees} trees</span>`:'';
    const b2=r.wind?`<span class="badge">🍃 ${r.wind} wind</span>`:'';
    return `<div class="row"><div>#${i+1}</div><div>${r.name} ${b1} ${b2}</div><div><b>${r.score}</b> pts</div></div>`;
  }).join('');
}

// ===== Save / Load =====
function saveKey(){ return 'idealforest.save.' + (player.name||'player').toLowerCase(); }
function save(){
  const data={player:{name:player.name,points:player.points,wind:player.wind},trees, winds};
  try{ localStorage.setItem(saveKey(), JSON.stringify(data)); }catch{}
  updateBoard();
}
function peekSave(){
  const raw=localStorage.getItem(saveKey());
  if(!raw) return null;
  try{ return JSON.parse(raw); } catch { return null; }
}
function loadSave(dataOrNull, keepPoints=false){
  const raw = dataOrNull || peekSave();
  if(!raw){ updateHUD(); return; }
  try{
    const d = raw;
    if (!keepPoints) player.points = d.player?.points || 0;
    player.wind = d.player?.wind || 0;

    trees.length=0; (d.trees||[]).forEach(t=>{
      // migrate old saves gracefully
      trees.push({ x: t.x, y: t.y, stage: Math.max(1, Math.min(3, t.stage||1)) });
    });
    winds.length=0; (d.winds||[]).forEach(w=>winds.push(w));
    updateHUD();
  }catch{}
}

// ===== Gameplay =====
function plant(x,y){
  if (player.points < COST.tree) { toast(`Need ${COST.tree} pts to plant 🌳`); return; }
  x=Math.max(40, Math.min(world.w-40, x));
  y=Math.max(200, Math.min(world.h-40, y));
  trees.push({ x, y, stage: 1 });
  player.points -= COST.tree;
  toast('Planted 🌸');
  updateHUD();
}
function nearestTree(x,y,dist=36){
  let best=-1,bd=dist*dist;
  for(let i=0;i<trees.length;i++){
    const dx=trees[i].x-x, dy=trees[i].y-y, d=dx*dx+dy*dy;
    if(d<=bd){bd=d; best=i;}
  }
  return best;
}

// 🌧️ Watering now upgrades exactly one stage (no time growth)
function waterSelected(){
  if (player.points < COST.water) { toast(`Need ${COST.water} pts to water`); return; }
  const i=player.selected;
  if(i<0||!trees[i]){ toast('Select a tree first'); return; }

  const t = trees[i];
  if (t.stage >= 3) { toast('This tree is fully grown'); return; }

  player.points -= COST.water;
  t.stage += 1;

  toast(t.stage === 2 ? 'Grew to Stage 2 🌱' : 'Grew to Stage 3 🌳');
  updateHUD();
}

function buildWind(){
  if (player.points < COST.wind) { toast(`Need ${COST.wind} pts to build windmill`); return; }
  const x=Math.max(60, Math.min(world.w-60, world.target.x));
  const y=Math.max(240, Math.min(world.h-60, world.target.y));
  winds.push({x,y,rot:0,pps:2});
  player.wind+=1; player.points-=COST.wind;
  toast('Built 🍃 windmill');
  updateHUD();
}
function sellSelected(){
  const i=player.selected;
  if(i<0||!trees[i]){ toast('Select a tree first'); return; }
  trees.splice(i,1);
  player.points+=5; player.selected=-1;
  toast('Removed tree (+5 pts)'); updateHUD();
}

// ===== Loop =====
let lastT=performance.now();
function loop(now){
  const dt=Math.min(0.05,(now-lastT)/1000); lastT=now;

  // move
  const dx=world.target.x-player.x, dy=world.target.y-player.y, d=Math.hypot(dx,dy);
  if(d>2){ const vx=(dx/d)*player.speed*dt, vy=(dy/d)*player.speed*dt; player.x+=vx; player.y+=vy; }

  // passive points from wind
  const passive=winds.reduce((s,w)=>s+(w.pps||0),0);
  player.points += passive*dt;

  // 🚫 removed time-based growth; trees only advance when watered

  // (You asked for no rotation — if any rotate code existed, it’s gone)
  // for(const w of winds){ w.rot += dt*4; }

  draw();
  updateHUD(); // (3) sync shared points from here
  requestAnimationFrame(loop);
}

// (3) Sync points back whenever HUD updates
function updateHUD(){
  HUD.trees.textContent = String(trees.length);
  HUD.points.textContent = String(Math.floor(player.points));
  HUD.wind.textContent   = String(player.wind);

  const top = (loadBoard()[0]?.score) || 0;
  player.growthBoost = 1 + Math.min(1.0, top / 1000);
  HUD.boost.textContent = player.growthBoost.toFixed(2) + 'x';

  if (player.name) updateSharedPoints(player.name, Math.floor(player.points));
  updateBoard();
}

// ===== Render =====
function draw(){
  // --- Background: prefer video if ready, else color ---
  const vid = AS.bgVid;
  if (vid && vid.readyState >= 2 && vid.videoWidth && vid.videoHeight) {
    const iw = vid.videoWidth, ih = vid.videoHeight;
    const scale = Math.min(world.w / iw, world.h / ih);
    const dw = iw * scale, dh = ih * scale;
    const dx = (world.w - dw) / 2, dy = (world.h - dh) / 2;
    CTX.drawImage(vid, 0, 0, iw, ih, dx, dy, dw, dh);
  } else {
    CTX.fillStyle = '#0b0f12';
    CTX.fillRect(0, 0, world.w, world.h);
  }

  // --- Trees (stage-based; no placeholder) ---
  const S = sceneScale();
  const treeSize1 = 60  * TREE_SCALE * S;
  const treeSize2 = 120 * TREE_SCALE * S;
  const treeSize3 = 160 * TREE_SCALE * S;

  for (let i = 0; i < trees.length; i++) {
    const t = trees[i];
    const sel = (i === player.selected);

    const img = (t.stage === 3 ? AS.t3 : (t.stage === 2 ? AS.t2 : AS.t1));
    const size = (t.stage === 3 ? treeSize3 : (t.stage === 2 ? treeSize2 : treeSize1));

    if (img && img.complete && img.naturalWidth) {
      CTX.drawImage(img, t.x - size / 2, t.y - size, size, size);
    }
    if (sel) {
      CTX.strokeStyle = 'rgba(255,255,255,.9)';
      CTX.lineWidth = 2;
      CTX.beginPath();
      CTX.arc(t.x, t.y - 10, 28, 0, Math.PI * 2);
      CTX.stroke();
    }
  }

  // --- Windmills (static, no rotation) ---
  const windSize = 72 * WIND_SCALE * S;
  for (const w of winds) {
    if (AS.wind && AS.wind.complete && AS.wind.naturalWidth) {
      CTX.drawImage(AS.wind, w.x - windSize / 2, w.y - windSize / 2, windSize, windSize);
    } else {
      CTX.save();
      CTX.translate(w.x, w.y);
      CTX.strokeStyle = 'white';
      CTX.beginPath();
      CTX.moveTo(0, 0); CTX.lineTo(24, 0);
      CTX.moveTo(0, 0); CTX.lineTo(-24, 0);
      CTX.moveTo(0, 0); CTX.lineTo(0, 24);
      CTX.moveTo(0, 0); CTX.lineTo(0, -24);
      CTX.stroke();
      CTX.restore();
    }
  }

  // --- Character ---
  const baseChar = 56;
  const charW = baseChar * CHAR_SCALE * S;
  const charH = baseChar * CHAR_SCALE * S;
  if (AS.char && AS.char.complete && AS.char.naturalWidth) {
    CTX.drawImage(AS.char, player.x - charW / 2, player.y - charH, charW, charH);
  } else {
    CTX.fillStyle = '#203a43';
    CTX.beginPath();
    CTX.arc(player.x, player.y - 10, 16 * S, 0, Math.PI * 2);
    CTX.fill();
    CTX.fillStyle = '#7fe9a9';
    CTX.fillRect(player.x - 6 * S, player.y - 10 * S, 12 * S, 22 * S);
  }
}

// ===== Toast =====
function toast(msg){
  TOAST.textContent=msg;
  TOAST.classList.add('show');
  clearTimeout(toast._t);
  toast._t=setTimeout(()=>TOAST.classList.remove('show'),1200);
}

// ===== Boot =====
function boot(){
  const n=(UI.name?.value||'').replace(/\s+/g,' ').trim();
  if(n){
    player.name=n;
    const pts = loadPointsFromShared(n);
    if (pts > 0) player.points = pts;
  }
  loadSave(null, true);   // keepPoints = true (shared points win)
  renderBoard();
  requestAnimationFrame(loop);
}
function tryPlayBg() {
  if (AS.bgVid && AS.bgVid.paused) {
    AS.bgVid.play().catch(()=>{});
  }
}
document.addEventListener('pointerdown', tryPlayBg, { once:true });
document.addEventListener('keydown', tryPlayBg, { once:true });
document.addEventListener('DOMContentLoaded', boot);
