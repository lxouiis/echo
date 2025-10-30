// Ideal Forest — images in /images1
// Implements: (1) shared leaderboard helpers, (2) name handler to load points,
// (3) sync back on HUD update, (4) loadSave keepPoints, (5) discrete growth on water only

// ===== Canvas & UI =====
const CANVAS = document.getElementById('world');
const CTX = CANVAS.getContext('2d');

const HUD = {
    trees: document.getElementById('treeCount'),
    points: document.getElementById('points'),
    wind: document.getElementById('windCount'),
    boost: document.getElementById('boost'),
    board: document.getElementById('board')
};

const UI = {
    plant: document.getElementById('plantBtn'),
    water: document.getElementById('waterBtn'),
    wind: document.getElementById('buildWindBtn'),
    sell: document.getElementById('sellTreeBtn'),
    name: document.getElementById('playerName'),
    save: document.getElementById('saveBtn'),
    selectNext: document.getElementById('selectNextBtn')
};

// (Optional) How-to modal — guarded so it never throws if markup missing
const HOW = {
    btn: document.getElementById('howBtn'),
    backdrop: document.getElementById('howBackdrop'),
    close: document.getElementById('howClose')
};

function openHow() {
    if (HOW.backdrop) {
        HOW.backdrop.classList.add('show');
        document.body.style.overflow = 'hidden';
    }
}

function closeHow() {
    if (HOW.backdrop) {
        HOW.backdrop.classList.remove('show');
        document.body.style.overflow = '';
    }
}
if (HOW.btn) HOW.btn.addEventListener('click', openHow);
if (HOW.close) HOW.close.addEventListener('click', closeHow);
if (HOW.backdrop) HOW.backdrop.addEventListener('click', (e) => { if (e.target === HOW.backdrop) closeHow(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeHow(); });

const TOAST = document.getElementById('toast');

// ===== Shared leaderboard (global points) =====
function getSharedPlayers() {
    try { return JSON.parse(localStorage.getItem("ecogame.players") || "[]"); } catch { return []; }
}

function saveSharedPlayers(players) {
    // Use backend API instead of localStorage
    if (Array.isArray(players) && players.length > 0) {
        const p = players[0];
        fetch('http://localhost:3000/api/leaderboard', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: p.name, total: p.total, game: 'Ideal Forest' })
        })
        .then(res => {
            if (!res.ok) {
                return res.text().then(text => {
                    console.error('POST error:', res.status, text);
                });
            }
            return res.json();
        })
        .catch(err => {
            console.error('POST fetch failed:', err);
        });
    }
}

function loadPointsFromShared(name) {
    if (!name) return 0;
    const n = String(name).toLowerCase().trim();
    const p = getSharedPlayers().find(function(x) { return ((x && x.name) || "").toLowerCase().trim() === n; });
    const v = Number(p && p.total);
    return Number.isFinite(v) ? v : 0;
}

function updateSharedPoints(name, newTotal) {
    if (!name) return;
    const n = String(name).toLowerCase().trim();
    const arr = getSharedPlayers();
    const i = arr.findIndex(function(x) { return ((x && x.name) || "").toLowerCase().trim() === n; });
    const total = Math.max(0, Math.floor(Number(newTotal) || 0));
    if (i >= 0) arr[i].total = total;
    else arr.push({ name, total });
    saveSharedPlayers(arr);
}

// ===== Costs =====
// Reverted to original point costs
const COST = { tree: 1000, water: 500, wind: 5000 };

// ===== Assets =====
const AS = {
    bgVid: (() => {
        const v = document.getElementById('bgVid');
        if (v) {
            v.muted = true;
            v.loop = true;
            v.playsInline = true;
            v.play().catch(() => {});
        }
        return v;
    })(),
    char: img('images1/char.png'),
    treeStage1: img('images1/tree.png'),
    treeStage2: img('images1/tree1.png'),
    treeStage3: img('images1/tree2.png'),
    wind: img('images1/wind.png')
};

function img(src) {
    const im = new Image();
    im.src = src;
    return im;
}

// ===== World & Player =====
const world = {
    w: CANVAS.width,
    h: CANVAS.height,
    target: { x: CANVAS.width * 0.5, y: CANVAS.height * 0.7 }
};

const BASE_W = 1280,
    BASE_H = 720;

function sceneScale() { return Math.min(world.w / BASE_W, world.h / BASE_H); }

const CHAR_SCALE = 2.2,
    WIND_SCALE = 1.6,
    TREE_SCALE = 1.6;

const player = {
    name: 'Player',
    x: CANVAS.width * 0.5,
    y: CANVAS.height * 0.8,
    speed: 260,
    points: 100,
    wind: 0,
    growthBoost: 1.0,
    selected: -1
};

const trees = [];
const winds = [];

// ===== Pointer =====
function lpos(e) {
    const r = CANVAS.getBoundingClientRect();
    const sx = CANVAS.width / r.width,
        sy = CANVAS.height / r.height;
    return { x: (e.clientX - r.left) * sx, y: (e.clientY - r.top) * sy };
}
let pointer = { x: world.target.x, y: world.target.y, down: false };

CANVAS.addEventListener('pointerdown', e => {
    const p = lpos(e);
    pointer = {...p, down: true };
    world.target = p;
    const k = nearestTree(p.x, p.y, 42);
    player.selected = k;
});
CANVAS.addEventListener('pointermove', e => {
    if (!pointer.down) return;
    const p = lpos(e);
    pointer = {...p, down: true };
    world.target = p;
});
CANVAS.addEventListener('pointerup', () => { pointer.down = false; });

// ===== UI =====
if (UI.plant) UI.plant.addEventListener('click', () => plant(player.x, player.y));
if (UI.water) UI.water.addEventListener('click', waterSelected);
if (UI.wind) UI.wind.addEventListener('click', buildWind);
if (UI.sell) UI.sell.addEventListener('click', sellSelected);
if (UI.selectNext) UI.selectNext.addEventListener('click', selectNextTree);

if (UI.name) UI.name.addEventListener('change', async () => {
    const n = (UI.name.value || '').replace(/\s+/g, ' ').trim();
    if (n) {
        player.name = n;
        // Fetch points from backend
        try {
            const res = await fetch(`http://localhost:3000/api/leaderboard?name=${encodeURIComponent(n)}&game=Ideal Forest`);
            if (res.ok) {
                const data = await res.json();
                // If backend returns an array, find the right entry
                let pts = 0;
                if (Array.isArray(data)) {
                    const entry = data.find(e => (e.name || '').toLowerCase() === n.toLowerCase());
                    pts = entry ? entry.total : 0;
                } else if (data && typeof data.total === 'number') {
                    pts = data.total;
                }
                player.points = pts;
                toast(`Loaded ${player.points} pts for ${player.name}!`);
            } else {
                player.points = 0;
                toast(`Loaded 0 pts for ${player.name}!`);
            }
        } catch {
            player.points = 0;
            toast(`Loaded 0 pts for ${player.name}!`);
        }
        loadSave(null, true);
        renderBoard();
        updateHUD();
    }
});
if (UI.save) UI.save.addEventListener('click', async () => {
    save();
    toast('Saved!');

    // Save to backend
    if (player.name && player.points > 0) {
        try {
            await fetch('http://localhost:3000/api/leaderboard', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: player.name, total: player.points, game: 'Ideal Forest' })
            });
            toast('Score saved to leaderboard!');
        } catch {
            toast('Failed to save score.');
        }
    }
});

// ===== Local leaderboard (for this page’s board view only) =====
const LB_KEY = 'idealforest.lb';

function loadBoard() { try { return JSON.parse(localStorage.getItem(LB_KEY) || '[]'); } catch { return [] } }

function saveBoard(a) { try { localStorage.setItem(LB_KEY, JSON.stringify(a)); } catch {} }

function updateBoard() {
    const a = loadBoard();
    if (!HUD.board) return;
    const i = a.findIndex(r => (r.name || '').toLowerCase() === player.name.toLowerCase());
    const entry = { name: player.name, score: Math.floor(player.points), wind: player.wind, trees: trees.length };
    if (i < 0) a.push(entry);
    else a[i] = entry;
    a.sort((x, y) => y.score - x.score);
    saveBoard(a);
}

function renderBoard() {
    const a = loadBoard();
    if (!HUD.board) return;
    if (!a.length) { HUD.board.innerHTML = '<p style="opacity:.8">No scores yet.</p>'; return; }
    HUD.board.innerHTML = a.map((r, i) => {
        const b1 = r.trees ? `<span class="badge">🌳 ${r.trees}</span>` : '';
        const b2 = r.wind ? `<span class="badge">🍃 ${r.wind}</span>` : '';
        return `<div class="row"><div>#${i+1}</div><div>${r.name} ${b1} ${b2}</div><div><b>${r.score}</b> pts</div></div>`;
    }).join('');
}

// ===== Save / Load =====
function saveKey() { return 'idealforest.save.' + (player.name || 'player').toLowerCase(); }

function save() {
    const data = { player: { name: player.name, points: player.points, wind: player.wind }, trees, winds };
    try { localStorage.setItem(saveKey(), JSON.stringify(data)); } catch {}
    updateBoard();
}

function peekSave() {
    const raw = localStorage.getItem(saveKey());
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
}

function loadSave(dataOrNull, keepPoints = false) {
    const raw = dataOrNull || peekSave();
    if (!raw) { updateHUD(); return; }
    try {
        const d = raw;
        if (!keepPoints) player.points = (d.player && d.player.points) || 0;
        player.wind = (d.player && d.player.wind) || 0;

        trees.length = 0;
        (d.trees || []).forEach(t => {
            trees.push({ x: t.x, y: t.y, stage: Math.max(1, Math.min(3, t.stage || 1)) });
        });
        winds.length = 0;
        (d.winds || []).forEach(w => winds.push(w));
        updateHUD();
    } catch {}
}

// ===== Gameplay =====
function selectNextTree() {
    if (trees.length === 0) {
        toast("There are no plants to select.");
        return;
    }
    player.selected = (player.selected + 1) % trees.length;
}

function plant(x, y) {
    if (player.points < COST.tree) { toast(`Need ${COST.tree} pts to plant 🌳`); return; }
    x = Math.max(40, Math.min(world.w - 40, x));
    y = Math.max(200, Math.min(world.h - 40, y));
    trees.push({ x, y, stage: 1 });
    player.points -= COST.tree;
    updateHUD();
}

function nearestTree(x, y, dist = 36) {
    let best = -1,
        bd = dist * dist;
    for (let i = 0; i < trees.length; i++) {
        const dx = trees[i].x - x,
            dy = trees[i].y - y,
            d = dx * dx + dy * dy;
        if (d <= bd) {
            bd = d;
            best = i;
        }
    }
    return best;
}

function waterSelected() {
    const i = player.selected;
    if (i < 0 || !trees[i]) { toast('Select a plant first.'); return; }
    if (player.points < COST.water) { toast(`Need ${COST.water} pts to water`); return; }

    const t = trees[i];
    if (t.stage >= 3) { toast('This tree is fully grown.'); return; }

    player.points -= COST.water;
    t.stage += 1;
    updateHUD();
}

function buildWind() {
    if (player.points < COST.wind) { toast(`Need ${COST.wind} pts to build windmill`); return; }
    const x = Math.max(60, Math.min(world.w - 60, player.x));
    const y = Math.max(240, Math.min(world.h - 60, player.y));
    winds.push({ x, y, rot: 0, pps: 1 / 1800 });
    player.wind += 1;
    player.points -= COST.wind;
    updateHUD();
}

function sellSelected() {
    const i = player.selected;
    if (i < 0 || !trees[i]) { toast('Select a plant first.'); return; }
    trees.splice(i, 1);
    player.points += 5; // Reverted to +5 points
    player.selected = -1;
    toast('Removed tree (+5 pts)'); // Updated toast message
    updateHUD();
}

// ===== Loop =====
let lastT = performance.now();

function loop(now) {
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;

    const dx = world.target.x - player.x,
        dy = world.target.y - player.y,
        d = Math.hypot(dx, dy);
    if (d > 2) {
        const vx = (dx / d) * player.speed * dt,
            vy = (dy / d) * player.speed * dt;
        player.x += vx;
        player.y += vy;
    }

    const passive = winds.reduce((s, w) => s + (w.pps || 0), 0);
    player.points += passive * dt;

    draw();
    updateHUD();
    requestAnimationFrame(loop);
}

function updateHUD() {
    HUD.trees.textContent = String(trees.length);
    HUD.points.textContent = String(Math.floor(player.points));
    HUD.wind.textContent = String(player.wind);

    const boardData = loadBoard();
    const firstPlayer = boardData[0];
    const top = (firstPlayer && firstPlayer.score) || 0;
    player.growthBoost = 1 + Math.min(1.0, top / 1000);
    HUD.boost.textContent = player.growthBoost.toFixed(2) + 'x';

    if (player.name) updateSharedPoints(player.name, Math.floor(player.points));
    renderBoard();
}

// ===== Render =====
function draw() {
    const vid = AS.bgVid;
    if (vid && vid.readyState >= 2 && vid.videoWidth && vid.videoHeight) {
        const iw = vid.videoWidth,
            ih = vid.videoHeight;
        const scale = Math.min(world.w / iw, world.h / ih);
        const dw = iw * scale,
            dh = ih * scale;
        const dx = (world.w - dw) / 2,
            dy = (world.h - dh) / 2;
        CTX.drawImage(vid, 0, 0, iw, ih, dx, dy, dw, dh);
    } else {
        CTX.fillStyle = '#0b0f12';
        CTX.fillRect(0, 0, world.w, world.h);
    }

    const S = sceneScale();
    const treeSize1 = 60 * TREE_SCALE * S;
    const treeSize2 = 120 * TREE_SCALE * S;
    const treeSize3 = 160 * TREE_SCALE * S;

    for (let i = 0; i < trees.length; i++) {
        const t = trees[i];
        const sel = (i === player.selected);

        const img = (t.stage === 3 ? AS.treeStage3 : (t.stage === 2 ? AS.treeStage2 : AS.treeStage1));
        const size = (t.stage === 3 ? treeSize3 : (t.stage === 2 ? treeSize2 : treeSize1));

        if (img && img.complete && img.naturalWidth) {
            CTX.drawImage(img, t.x - size / 2, t.y - size, size, size);
        }
        if (sel) {
            CTX.strokeStyle = '#7cfc00';
            CTX.lineWidth = 4;
            CTX.beginPath();
            CTX.arc(t.x, t.y - size / 2, size / 2 + 6, 0, Math.PI * 2);
            CTX.stroke();
        }
    }

    const windSize = 72 * WIND_SCALE * S;
    for (const w of winds) {
        if (AS.wind && AS.wind.complete && AS.wind.naturalWidth) {
            CTX.drawImage(AS.wind, w.x - windSize / 2, w.y - windSize / 2, windSize, windSize);
        } else {
            CTX.save();
            CTX.translate(w.x, w.y);
            CTX.strokeStyle = 'white';
            CTX.beginPath();
            CTX.moveTo(0, 0);
            CTX.lineTo(24, 0);
            CTX.moveTo(0, 0);
            CTX.lineTo(-24, 0);
            CTX.moveTo(0, 0);
            CTX.lineTo(0, 24);
            CTX.moveTo(0, 0);
            CTX.lineTo(0, -24);
            CTX.stroke();
            CTX.restore();
        }
    }

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
function toast(msg) {
    TOAST.textContent = msg;
    TOAST.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => TOAST.classList.remove('show'), 1200);
}

// ===== Boot =====
function boot() {
    const uiName = UI.name;
    const n = ((uiName && uiName.value) || '').replace(/\s+/g, ' ').trim();
    if (n) {
        player.name = n;
        const pts = loadPointsFromShared(n);
        if (pts > 0) player.points = pts;
    }
    loadSave(null, true);
    renderBoard();
    requestAnimationFrame(loop);
}

function tryPlayBg() {
    if (AS.bgVid && AS.bgVid.paused) {
        AS.bgVid.play().catch(() => {});
    }
}
document.addEventListener('pointerdown', tryPlayBg, { once: true });
document.addEventListener('keydown', tryPlayBg, { once: true });
document.addEventListener('DOMContentLoaded', boot);