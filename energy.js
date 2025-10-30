// CONFIG: scoring
var CORRECT_SCORE = 30; // Changed from 20 to 30
var WRONG_SCORE = -1;

// Leaderboard storage
var LS_KEY = "ecogame.players";

function loadPlayers() { try { return JSON.parse(localStorage.getItem(LS_KEY) || "[]"); } catch (e) { return [] } }

function savePlayers(p) { localStorage.setItem(LS_KEY, JSON.stringify(p)) }

function addScore(name, delta) {
    var arr = loadPlayers();
    var n = String(name || "").trim();
    var i = arr.findIndex(p => (p.name || "").toLowerCase() === n.toLowerCase());
    if (i < 0) {
        arr.push({ name: n, total: 0, lastPlayed: Date.now() });
        i = arr.length - 1;
    }
    arr[i].total = (arr[i].total || 0) + (delta || 0);
    arr[i].lastPlayed = Date.now();
    arr.sort((a, b) => (b.total || 0) - (a.total || 0));
    savePlayers(arr);
    return arr[i].total || 0;
}

// Shuffle
function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var t = a[i];
        a[i] = a[j];
        a[j] = t;
    }
    return a;
}

// State
var playerName = "",
    lock = false,
    first = null,
    second = null;
var moves = 0,
    roundScore = 0,
    pairsFound = 0;

// Pairs
var PAIRS = [
    { id: "lights", type: "bad", text: "Leave lights on" },
    { id: "lights", type: "good", text: "Turn off lights" },
    { id: "water", type: "bad", text: "Long shower" },
    { id: "water", type: "good", text: "5-minute shower" },
    { id: "charger", type: "bad", text: "Charger always plugged" },
    { id: "charger", type: "good", text: "Unplug when full" },
    { id: "ac", type: "bad", text: "AC at 18°C" },
    { id: "ac", type: "good", text: "Set 24–26°C" },
    { id: "laundry", type: "bad", text: "Half-load hot" },
    { id: "laundry", type: "good", text: "Full-load cold" },
    { id: "transport", type: "bad", text: "Short car trip" },
    { id: "transport", type: "good", text: "Walk / cycle" }
];

// DOM
var grid = document.getElementById("grid");
var startBtn = document.getElementById("startBtn");
var restartBtn = document.getElementById("restartBtn");
var movesEl = document.getElementById("moves");
var scoreEl = document.getElementById("score");
var toastEl = document.getElementById("toast");
var playerNameInput = document.getElementById("playerName");
var howto = document.getElementById("howto");
var howtoClose = document.getElementById("howtoClose");
var endCard = document.getElementById("endCard");
var finalScore = document.getElementById("finalScore");
var finalMoves = document.getElementById("finalMoves");
var playAgain = document.getElementById("playAgain");

// UI helpers
function toast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => toastEl.classList.remove("show"), 1400);
}

function setMoves(v) { if (movesEl) movesEl.textContent = "Moves: " + v; }

function setRoundScore(v) { if (scoreEl) scoreEl.textContent = "Score: " + v; }

// Deck
function buildDeck() {
    var deck = PAIRS.map((p, idx) => ({ id: p.id, type: p.type, text: p.text, key: p.id + "-" + p.type + "-" + idx }));
    shuffle(deck);
    grid.innerHTML = deck.map(cardHTML).join("");
    Array.from(document.querySelectorAll(".card")).forEach(card => {
        card.addEventListener("click", () => onFlip(card));
        card.addEventListener("keydown", e => {
            if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onFlip(card)
            }
        })
    });
}

function cardHTML(c) {
    var cls = c.type === "good" ? "front good" : "front bad";
    return `<div class="card" tabindex="0" data-id="${c.id}" data-type="${c.type}">
    <div class="card-inner">
      <div class="face back">Energy Saver</div>
      <div class="face ${cls}">${c.text}</div>
    </div>
  </div>`;
}

// Game control
function beginNewGame() {
    var val = playerNameInput && playerNameInput.value ? playerNameInput.value.trim() : "";
    playerName = val || "Player";
    lock = false;
    first = null;
    second = null;
    moves = 0;
    roundScore = 0;
    pairsFound = 0;
    setMoves(0);
    setRoundScore(0);
    buildDeck();
    if (startBtn) startBtn.style.display = "none";
    if (restartBtn) restartBtn.style.display = "inline-block";
    toast("Find matching pairs!");
}

function startGame() {
    if (howto) {
        document.body.classList.add("modal-open");
        howto.classList.add("show");
        if (howtoClose) {
            howtoClose.onclick = function() {
                howto.classList.remove("show");
                document.body.classList.remove("modal-open");
                beginNewGame();
            };
        }
    } else { beginNewGame(); }
}

function onFlip(card) {
    if (lock) return;
    if (!card || card.classList.contains("flipped")) return;
    card.classList.add("flipped");
    if (!first) { first = card; return }
    second = card;
    lock = true;
    moves++;
    setMoves(moves);

    var match = first.getAttribute("data-id") === second.getAttribute("data-id") && first !== second;
    if (match) {
        pairsFound++;
        roundScore += CORRECT_SCORE;
        setRoundScore(roundScore);
        toast("Correct! +" + CORRECT_SCORE);
        lock = false;
        first = null;
        second = null;
        if (pairsFound === PAIRS.length / 2) {
            document.body.classList.add("modal-open");
            var total = addScore(playerName, roundScore);
            if (finalScore) finalScore.textContent = "Score: " + roundScore;
            if (finalMoves) finalMoves.textContent = "Moves: " + moves;
            if (endCard) endCard.classList.add("show");
            toast("Saved! +" + roundScore + " (Total: " + total + ")");
        }
    } else {
        roundScore += WRONG_SCORE;
        setRoundScore(roundScore);
        toast("Wrong " + WRONG_SCORE);
        setTimeout(() => {
            if (first) first.classList.remove("flipped");
            if (second) second.classList.remove("flipped");
            lock = false;
            first = null;
            second = null;
        }, 700);
    }
}

function restart() {
    lock = false;
    first = null;
    second = null;
    moves = 0;
    roundScore = 0;
    pairsFound = 0;
    setMoves(0);
    setRoundScore(0);
    buildDeck();
    toast("Shuffled!");
}

// Events
if (startBtn) startBtn.addEventListener("click", startGame);
if (restartBtn) restartBtn.addEventListener("click", restart);
if (playAgain) playAgain.addEventListener("click", function() {
    if (endCard) endCard.classList.remove("show");
    startGame();
});

// small helper: close modals with ESC
document.addEventListener("keydown", function(e) {
    if (e.key === "Escape") {
        if (howto && howto.classList.contains("show")) howto.classList.remove("show");
        if (endCard && endCard.classList.contains("show")) endCard.classList.remove("show");
    }
});

// Init (renders an initial board; game only truly starts after Start -> Got it)
buildDeck();