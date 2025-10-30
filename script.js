// —— Persistent totals via localStorage ——
const LS_KEY = "ecogame.players";

function loadPlayers() { try { return JSON.parse(localStorage.getItem(LS_KEY) || "[]"); } catch { return []; } }

function savePlayers(players) { localStorage.setItem(LS_KEY, JSON.stringify(players)); }

function getPlayerTotal(name) {
    const key = String(name || "").toLowerCase();
    const p = loadPlayers().find(x => (x.name || "").toLowerCase() === key);
    return p ? (p.total || 0) : 0;
}

function upsertAndAddScore(name, delta) {
    // Use backend API instead of localStorage
    const key = String(name || "").trim();
    if (!key) return;
    const total = delta || 0;
    fetch('http://localhost:3000/api/leaderboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: key, total, game: 'Waste Segregation' })
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

// —— Game state ——
let playerName = "";
let sessionScore = 0;
let itemsSortedCount = 0;

// Map items to bins (exactly the 14 listed)
const correctMap = {
    banana: "compost",
    battery: "hazardous",
    paper: "recycle",
    bottle: "recycle",
    apple: "compost",
    fishbone: "compost",
    plasticbag: "recycle",
    chips: "recycle",
    phone: "hazardous",
    cloth: "recycle",
    glass: "recycle",
    cardboard: "recycle",
    joystick: "hazardous",
    bone: "compost"
};

// On load
document.addEventListener("DOMContentLoaded", () => {
    const sb = document.getElementById("startBtn");
    const fb = document.getElementById("finishBtn");
    const ab = document.getElementById("playAgain");
    const hc = document.getElementById("howtoClose");

    if (sb) sb.addEventListener("click", startGame);
    if (fb) fb.addEventListener("click", function() {
        finishGameAndSave();
        fb.disabled = true;
        fb.textContent = "Saved!";
        setTimeout(function() {
            fb.disabled = false;
            fb.textContent = "Finish";
        }, 2000);
    });
    if (ab) ab.addEventListener("click", playAgain);
    if (hc) hc.addEventListener("click", startGame);

    enableDnD();
    enableKeyboardDrops();
    writeScore(0);
    window.addEventListener("resize", () => keepInBounds(getVisibleItems()));
});

// Start flow
function startGame() {
    const input = document.getElementById("playerName");
    playerName = (input && input.value ? input.value.trim() : "") || "Player";
    const howto = document.getElementById("howto");
    if (howto) howto.classList.remove("show");
    document.body.classList.remove("modal-open");
    resetRound(true);
    writeScore(0);
    showStartFlash();
    showFirstRunHint();
}

// Reset round: randomize positions and show ALL items
function resetRound(doToast) {
    sessionScore = 0;
    itemsSortedCount = 0;
    const all = getAllItems();
    setRandomPositions(all); // random placement each round
    all.forEach(el => el.style.display = "block");
    if (doToast) toast("Items randomized!");
}

// Finish and persist
function finishGameAndSave() {
    if (!playerName) return toast("Enter name first");
    upsertAndAddScore(playerName, sessionScore);

    const finalScoreEl = document.getElementById("finalScore");
    const finalItemsEl = document.getElementById("finalItems");
    const endCard = document.getElementById("endCard");

    if (finalScoreEl) finalScoreEl.textContent = `Final Score: ${sessionScore}`;
    if (finalItemsEl) finalItemsEl.textContent = `Items Sorted: ${itemsSortedCount}`;
    if (endCard) endCard.classList.add("show");
    document.body.classList.add("modal-open");

    sessionScore = 0;
    toast("congratiulations");
}

// Play again
function playAgain() {
    const endCard = document.getElementById("endCard");
    if (endCard) endCard.classList.remove("show");
    document.body.classList.remove("modal-open");
    resetRound(true);
    writeScore(0);
}

// Items and bins helpers
function getAllItems() { return Array.from(document.querySelectorAll(".item")); }

function getVisibleItems() { return getAllItems().filter(el => el.style.display !== "none"); }

// DnD
function enableDnD() {
    const items = getAllItems();
    const bins = document.querySelectorAll(".bin");

    items.forEach(item => {
        item.addEventListener("dragstart", e => {
            if (!e.dataTransfer) return;
            e.dataTransfer.setData("text/plain", e.target.id);
            e.dataTransfer.effectAllowed = "move";
        });
    });

    bins.forEach(bin => {
        ["dragenter", "dragover"].forEach(type => {
            bin.addEventListener(type, e => {
                e.preventDefault();
                bin.classList.add("drag-over");
                if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
            });
        });
        bin.addEventListener("dragleave", () => bin.classList.remove("drag-over"));
        bin.addEventListener("drop", e => {
            e.preventDefault();
            bin.classList.remove("drag-over");
            const dt = e.dataTransfer;
            const id = dt ? dt.getData("text/plain") : "";
            const item = id ? document.getElementById(id) : null;
            if (!item) return;
            handleDrop(item, bin.dataset.type);
        });
    });
}

// Shared drop logic — round ends when all 14 items are sorted
function handleDrop(itemEl, binType) {
    const id = itemEl.id;
    const isCorrect = correctMap[id] === binType;

    if (isCorrect) {
        sessionScore += 10;
        itemsSortedCount++;
        itemEl.style.display = "none";
        toast(praiseMessage(binType));
        showScorePopup("+10", true); // Call pop-up for correct answer
    } else {
        sessionScore = Math.max(0, sessionScore - 5);
        toast(critiqueMessage(id, binType));
        showScorePopup("-5", false); // Call pop-up for incorrect answer
    }

    writeScore(sessionScore);

    if (getVisibleItems().length === 0) {
        finishGameAndSave();
    }
}

// Keyboard accessibility: focus item, press 1/2/3 to drop to bins
function enableKeyboardDrops() {
    document.addEventListener("keydown", (e) => {
        const active = document.activeElement;
        if (!active || !active.classList || !active.classList.contains("item")) return;
        let bin = null;
        if (e.key === "1") bin = "compost";
        if (e.key === "2") bin = "recycle";
        if (e.key === "3") bin = "hazardous";
        if (!bin) return;
        e.preventDefault();
        handleDrop(active, bin);
    });
}

// --- NEW: Function to show the score pop-up ---
let scorePopupTimeout;

function showScorePopup(text, isCorrect) {
    const popup = document.getElementById("scorePopup");
    if (!popup) return;

    popup.textContent = text;
    popup.classList.remove("correct", "incorrect");
    popup.classList.add(isCorrect ? "correct" : "incorrect");

    popup.classList.add("show");

    clearTimeout(scorePopupTimeout);
    scorePopupTimeout = setTimeout(() => {
        popup.classList.remove("show");
    }, 1000); // Duration of the animation
}

// UI helpers
function writeScore(val) {
    const el = document.getElementById("score");
    if (el) el.textContent = String(val);
}

function showStartFlash() {
    const el = document.getElementById("startFlash");
    if (!el) return;
    el.classList.add("show");
    clearTimeout(showStartFlash._t);
    showStartFlash._t = setTimeout(() => el.classList.remove("show"), 900);
}

function showFirstRunHint() {
    const HINT_KEY = "ecogame.hintShown";
    try {
        if (localStorage.getItem(HINT_KEY)) return;
        const el = document.getElementById("hint");
        if (!el) return;
        el.textContent = "Tip: 1 = Compost, 2 = Recycle, 3 = Hazardous. Drag with mouse or use keys.";
        el.classList.add("show");
        setTimeout(() => el.classList.remove("show"), 3000);
        localStorage.setItem(HINT_KEY, "1");
    } catch {}
}

function toast(msg) {
    let box = document.querySelector(".toast");
    if (!box) {
        box = document.createElement("div");
        box.className = "toast";
        document.body.appendChild(box);
    }
    box.textContent = msg;
    box.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => box.classList.remove("show"), 1400);
}

// Messages
function praiseMessage(type) {
    const lines = {
        recycle: "Great! Recycling saves energy.",
        compost: "Nice! Compost turns scraps into soil.",
        hazardous: "Good job! Hazardous waste kept safe."
    };
    return lines[type] || "Well done!";
}

const critiqueMessage = (id, target) => {
    const why = {
        banana: "Food scraps belong in compost.",
        battery: "Batteries are hazardous—never bin normally.",
        paper: "Paper goes to recycling.",
        bottle: "Plastics go to recycling.",
        apple: "Food scraps belong in compost.",
        fishbone: "Organic waste should be composted.",
        plasticbag: "Bags go to recycling.",
        chips: "Wrappers go to recycling if accepted.",
        phone: "E-waste is hazardous; use e-waste bins.",
        cloth: "Textiles: send to textile recycling if available.",
        glass: "Glass belongs in recycling.",
        cardboard: "Cardboard goes to recycling.",
        joystick: "E-waste is hazardous; use e-waste bins.",
        bone: "Bones are organic; compost them."
    };
    const targetText = target === "recycle" ? "recycling" : target;
    return (why[id] || "Not quite.") + ` Try ${targetText}.`;
}

// —— Randomization ——
function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function keepInBounds(items) {
    items.forEach(el => {
        const leftPct = Math.min(98, Math.max(0, parseFloat(el.style.left) || 0));
        const topPct = Math.min(98, Math.max(0, parseFloat(el.style.top) || 0));
        el.style.left = leftPct + "%";
        el.style.top = topPct + "%";
    });
}

function setRandomPositions(items) {
    const game = document.getElementById("game");
    if (!game) return;

    const gameRect = game.getBoundingClientRect();
    const itemW = 72,
        itemH = 72;
    const pad = 16;
    const bottomSafe = 140;

    const maxLeft = Math.max(0, gameRect.width - itemW - pad * 2);
    const maxTop = Math.max(0, gameRect.height - bottomSafe - itemH - pad * 2);

    const placed = [];
    const shuffled = shuffle(items.slice());

    shuffled.forEach(el => {
        let tries = 0,
            x, y;
        do {
            x = Math.random() * maxLeft + pad;
            y = Math.random() * maxTop + pad;
            tries++;
        } while (tries < 12 && placed.some(p => Math.hypot(p.x - x, p.y - y) < 60));

        placed.push({ x, y });
        const leftPct = (x / gameRect.width) * 100;
        const topPct = (y / gameRect.height) * 100;
        el.style.left = leftPct.toFixed(2) + "%";
        el.style.top = topPct.toFixed(2) + "%";
    });
}
