/* Leaderboard (localStorage) */
var LS_KEY = "ecogame.players";

function loadPlayers() { try { return JSON.parse(localStorage.getItem(LS_KEY) || "[]"); } catch { return []; } }

function savePlayers(a) { localStorage.setItem(LS_KEY, JSON.stringify(a)); }

function addScore(name, delta) {
    var arr = loadPlayers();
    var n = String(name || "").trim() || "Player";
    var i = arr.findIndex(function(p) { return (p.name || "").toLowerCase() === n.toLowerCase(); });
    if (i < 0) {
        arr.push({ name: n, total: 0, lastPlayed: Date.now() });
        i = arr.length - 1;
    }
    arr[i].total = (arr[i].total || 0) + (delta || 0);
    arr[i].lastPlayed = Date.now();
    arr.sort(function(a, b) { return (b.total || 0) - (a.total || 0); });
    savePlayers(arr);
    return arr[i].total || 0;
}

/* Config */
var DEVICES = ["bigbulb", "fancylight", "lamp", "tv"]; // alphabetical keys
var ROOM_DIR = "roomimages";
var EXT = ".jpg";

/* State */
var DURATION = 60,
    tickMs = 100;
var onSet = new Set();
var score = 0,
    offCount = 0,
    tLeft = DURATION;
var timerId = null,
    rngSeed = 0,
    running = false;
var clickLocked = false;

/* DOM */
var roomEl = document.getElementById("room");
var startBtn = document.getElementById("startBtn");
var restartBtn = document.getElementById("restartBtn");
var playerNameEl = document.getElementById("playerName");
var timerEl = document.getElementById("timer");
var pointsEl = document.getElementById("points");
var toastEl = document.getElementById("toast");
var howto = document.getElementById("howto");
var howtoClose = document.getElementById("howtoClose");
var endCard = document.getElementById("endCard");
var finalScore = document.getElementById("finalScore");
var finalClicks = document.getElementById("finalClicks");
var finalCps = document.getElementById("finalCps");
var playAgain = document.getElementById("playAgain");
var hs = {
    bigbulb: document.getElementById("hs-bigbulb"),
    fancylight: document.getElementById("hs-fancylight"),
    lamp: document.getElementById("hs-lamp"),
    tv: document.getElementById("hs-tv")
};
var switches = Array.prototype.slice.call(document.querySelectorAll(".switch"));

/* Audio */
var sndOn = document.getElementById("snd-on");
var sndOff = document.getElementById("snd-off");
var sndClick = document.getElementById("snd-click");
[sndOn, sndOff, sndClick].forEach(function(a) { if (a) a.volume = 0.35; });

function play(a) { try { a && (a.currentTime = 0, a.play()); } catch (e) {} }

/* Toast */
function toast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(function() { toastEl.classList.remove("show"); }, 1100);
}

/* --- NEW: Score Pop-up Function --- */
var scorePopupTimeout;

function showScorePopup(text) {
    var popup = document.getElementById("scorePopup");
    if (!popup) return;

    popup.textContent = text;
    popup.classList.add("show");

    clearTimeout(scorePopupTimeout);
    scorePopupTimeout = setTimeout(function() {
        popup.classList.remove("show");
    }, 1000); // Duration of the animation
}

/* RNG */
function rand() { rngSeed = (rngSeed * 1664525 + 1013904223) >>> 0; return rngSeed / 4294967296; }

function chance(p) { return rand() < p; }

/* Preload */
function preloadKeys(keys) {
    keys.forEach(function(k) {
        var img = new Image();
        img.src = ROOM_DIR + "/" + k + EXT;
    });
}

/* Filenames */
function keyFromSet() {
    if (onSet.size === 0) return "off";
    var arr = Array.from(onSet);
    arr.sort();
    return arr.join("_");
}

function applyRoomImage() {
    var key = keyFromSet();
    roomEl.style.backgroundImage = "url('" + ROOM_DIR + "/" + key + EXT + "')";
}

/* Switch sync */
function syncPanel() {
    switches.forEach(function(btn) {
        var d = btn.getAttribute("data-device");
        btn.setAttribute("aria-pressed", onSet.has(d) ? "true" : "false");
    });
}

/* Reset/start/end */
function reset() {
    if (timerId) {
        clearInterval(timerId);
        timerId = null;
    }
    endCard.classList.remove("show");
    onSet.clear();
    score = 0;
    offCount = 0;
    tLeft = DURATION;
    running = false;
    rngSeed = (Date.now() & 0xffffffff) >>> 0;
    pointsEl.textContent = "0 pts";
    timerEl.textContent = String(DURATION);
    applyRoomImage();
    syncPanel();
    startBtn.style.display = "inline-block";
    restartBtn.style.display = "none";
}

function endRound(save) {
    running = false;
    if (timerId) {
        clearInterval(timerId);
        timerId = null;
    }
    var cps = (offCount / DURATION).toFixed(2);
    finalScore.textContent = "Score: " + score;
    finalClicks.textContent = "OFF actions: " + offCount;
    finalCps.textContent = "OFF/sec: " + cps;
    endCard.classList.add("show");
    if (save) {
        var total = addScore((playerNameEl.value || "Player"), score);
        toast("Saved! +" + score + " (Total: " + total + ")");
    }
}

/* Start */
function start() {
    reset();
    howto.classList.add("show");

    function begin() {
        howto.classList.remove("show");
        running = true;
        startBtn.style.display = "none";
        restartBtn.style.display = "inline-block";
        preloadKeys(["off"].concat(DEVICES));

        switches.forEach(function(btn) {
            btn.onclick = function() {
                if (!running) return;
                var d = btn.getAttribute("data-device");
                var isOn = onSet.has(d);
                if (!isOn) {
                    toast("Switch can only turn OFF.");
                    return;
                }
                onSet.delete(d);
                play(sndOff);
                score += 10;
                showScorePopup("+10"); // Call pop-up
                offCount += 1;
                pointsEl.textContent = score + " pts";
                play(sndClick);
                applyRoomImage();
                syncPanel();
            };
        });

        switches.forEach(function(btn) {
            btn.addEventListener("keydown", function(e) {
                var d = btn.getAttribute("data-device");
                var isOn = onSet.has(d);
                if (!isOn && (e.key === "Enter" || e.key === " ")) {
                    e.preventDefault();
                    toast("Switch can only turn OFF.");
                }
            });
        });

        DEVICES.forEach(function(name) {
            var el = hs[name];
            if (!el) return;
            el.onclick = function() {
                if (!running || clickLocked) return;
                if (onSet.has(name)) {
                    clickLocked = true;
                    onSet.delete(name);
                    applyRoomImage();
                    syncPanel();
                    play(sndOff);
                    score += 10;
                    showScorePopup("+10"); // Call pop-up
                    offCount += 1;
                    pointsEl.textContent = score + " pts";
                    play(sndClick);
                    setTimeout(function() { clickLocked = false; }, 120);
                }
            };
        });

        timerId = setInterval(function() {
            var prev = Math.ceil(tLeft);
            tLeft -= tickMs / 1000;
            if (Math.ceil(tLeft) !== prev) { timerEl.textContent = String(Math.max(0, Math.ceil(tLeft))); }
            DEVICES.forEach(function(n) { if (!onSet.has(n) && chance(0.007)) { onSet.add(n); } });
            applyRoomImage();
            syncPanel();
            if (tLeft <= 0) { endRound(true); }
        }, tickMs);
    }

    howtoClose.onclick = begin;
}

/* Wire */
if (playAgain) playAgain.addEventListener("click", start);
if (startBtn) startBtn.addEventListener("click", start);
if (restartBtn) restartBtn.addEventListener("click", start);

/* Boot */
reset();
