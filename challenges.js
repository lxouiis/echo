
// Use absolute API when not served by Flask:
const API_BASE = 'http://localhost:5050';

// ===== Helpers & State =====
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));

const LS_KEY = "ecogame.players";
const LAST_PLAYER = "ecogame.lastPlayer";

function loadPlayers(){ try{return JSON.parse(localStorage.getItem(LS_KEY)||"[]");}catch{return[];} }
function savePlayers(x){ localStorage.setItem(LS_KEY, JSON.stringify(x)); }
function setActivePlayer(name){
  const key = (name||"").trim(); if(!key) return;
  let players = loadPlayers();
  if(!players.some(p=>p.name.toLowerCase()===key.toLowerCase())){
    players.push({ name:key, total:0, last:Date.now() });
    savePlayers(players);
  }
  localStorage.setItem(LAST_PLAYER, key);
  renderScore();
}
function upsertScore(name, delta){
  const a = loadPlayers(); const k=(name||"Player").trim(); if(!k) return;
  const i = a.findIndex(p=>p.name.toLowerCase()===k.toLowerCase());
  if(i>=0){ a[i].total=(a[i].total||0)+(delta||0); a[i].last=Date.now(); }
  else { a.push({name:k,total:(delta||0),last:Date.now()}); }
  a.sort((x,y)=> (y.total||0)-(x.total||0)); savePlayers(a); renderScore();
}
function renderScore(){
  const n = localStorage.getItem(LAST_PLAYER) || "Player";
  const total = (loadPlayers().find(p=>p.name.toLowerCase()===n.toLowerCase())?.total)||0;
  $("#player-name").textContent = `👤 ${n}`;
  $("#player-score").textContent = `⭐ ${total}`;
}
renderScore();

// ===== Toast =====
const toastEl = $("#toast");
function toast(msg, ok=true){
  toastEl.textContent = msg;
  toastEl.style.borderLeftColor = ok ? "var(--ok)" : "var(--err)";
  toastEl.classList.add("show");
  setTimeout(()=> toastEl.classList.remove("show"), 2500);
}

// ===== Name Modal =====
const nameModal = $("#name-modal");
const nameInput = $("#name-input");
$("#btn-setname").addEventListener("click", openNameModal);
$("#player-name").addEventListener("click", openNameModal);
function openNameModal(){ nameInput.value = localStorage.getItem(LAST_PLAYER) || ""; nameModal.showModal(); setTimeout(()=> nameInput?.focus(), 0); }
$("#save-name").addEventListener("click", e=>{
  e.preventDefault();
  const val = (nameInput.value || "").trim();
  if(!val) return;
  setActivePlayer(val);
  toast(`Hello, ${val}!`, true);
  nameModal.close();
});

// ===== Leaderboard =====
$("#btn-leaderboard").addEventListener("click", ()=>{
  const lb = $("#lb-body");
  const rows = loadPlayers();
  if(!rows.length){ lb.innerHTML = "<p class='muted'>No scores yet.</p>"; }
  else{
    lb.innerHTML = `<table style="width:100%;border-collapse:collapse">
      <thead><tr><th style="text-align:left">Rank</th><th style="text-align:left">Player</th><th style="text-align:right">Points</th></tr></thead>
      <tbody>
        ${rows.map((p,i)=>`<tr>
          <td>#${i+1}</td><td>${p.name}</td><td style="text-align:right">${p.total}</td>
        </tr>`).join("")}
      </tbody>
    </table>`;
  }
  $("#lb-modal").showModal();
});

// ===== Identify flow =====
const fileInput = $("#file-input");
const thumbImg = $("#thumb-img");
const thumbFallback = $("#thumb .thumb-fallback");
const searchInput = $("#search-input");
let selectedFile = null;

$("#btn-upload").addEventListener("click", ()=> fileInput.click());
$("#searchbar").addEventListener("dragover", e=>{ e.preventDefault(); e.dataTransfer.dropEffect="copy"; });
$("#searchbar").addEventListener("drop", e=>{
  e.preventDefault();
  const f = e.dataTransfer.files?.[0];
  if(f){ setSelectedFile(f); }
});
fileInput.addEventListener("change", e=>{
  if(e.target.files && e.target.files[0]) setSelectedFile(e.target.files[0]);
});
function setSelectedFile(file){
  selectedFile = file;
  const url = URL.createObjectURL(file);
  thumbImg.src = url;
  thumbImg.style.display = "block";
  thumbFallback.style.display = "none";
  searchInput.value = file.name;
  $("#result-shot").src = url;
  $("#results-card").hidden = true;
}

// Progress
const PROGRESS = $("#progress"), BAR = $("#bar"), P_TXT = $("#progress-text");
function startProgress(){
  PROGRESS.classList.remove("hidden"); PROGRESS.setAttribute("aria-hidden","false");
  BAR.style.width = "10%"; P_TXT.textContent = "Uploading…";
  let v = 10; PROGRESS._timer = setInterval(()=>{ v = Math.min(95, v + Math.random()*7);
    BAR.style.width = v + "%";
    P_TXT.textContent = v<35 ? "Uploading…" : v<65 ? "Analyzing…" : "Comparing species…";
  }, 450);
}
function endProgress(){ clearInterval(PROGRESS._timer); PROGRESS.classList.add("hidden"); PROGRESS.setAttribute("aria-hidden","true"); }

$("#btn-identify").addEventListener("click", async ()=>{
  if(!selectedFile){ toast("Pick an image first", false); return; }
  startProgress();
  try{
    const fd = new FormData(); fd.append("image", selectedFile);
    const res = await fetch("/api/identify", { method:"POST", body: fd });
    if(!res.ok) throw new Error(`Identify failed (${res.status})`);
    const data = await res.json();
    showResult(data);

    // Reward + Kudos popup (+10 pts)
    const who = localStorage.getItem(LAST_PLAYER) || "Player";
    upsertScore(who, 10);
    $("#kudos-modal").showModal();
  }catch(err){ console.error(err); toast("Could not identify the plant", false); }
  finally{ endProgress(); }
});

function showResult(data){
  const name = data?.name || data?.scientific_name || "Unknown plant";
  const family = data?.family || "—";
  const conf = data?.probability != null ? Math.round(data.probability*100) + "%" : "—";
  $("#res-name").textContent = name;
  $("#res-family").textContent = `Family: ${family}`;
  $("#res-confidence").textContent = `Confidence: ${conf}`;
  const meta = [];
  if(Array.isArray(data?.common_names) && data.common_names.length){
    meta.push(`<div class="muted">Also called: ${data.common_names.slice(0,4).join(", ")}</div>`);
  }
  if(data?.wikipedia_url){
    meta.push(`<div><a href="${data.wikipedia_url}" target="_blank" rel="noopener">Learn more ↗</a></div>`);
  }
  $("#res-meta").innerHTML = meta.join("");
  $("#results-card").hidden = false;
}

// ===== Challenges (submit proof to earn points) =====
const challenges = [
  { id: 'plant-sapling', title: 'Plant a Sapling', desc: 'Plant a tree in your garden or a community area.', pts: 60, icon:'🌳' },
  { id: 'waste-free-day', title: 'Waste-Free Wednesday', desc: 'Go a day without single-use plastics.', pts: 60, icon:'♻️' },
  { id: 'mini-composter', title: 'Build a Mini Composter', desc: 'Create a small compost bin for your kitchen scraps.', pts: 60, icon:'🌱' },
];
function renderChallenges(){
  const list = $("#challenge-list"); list.innerHTML = '';
  for(const c of challenges){
    const row = document.createElement('div'); row.className = 'challenge';
    row.innerHTML = `
      <div class="icon">${c.icon}</div>
      <div>
        <div style="font-weight:700;color:#7ce37c">${c.title}</div>
        <div class="muted">${c.desc}</div>
      </div>
      <div>
        <span class="pts">+${c.pts} pts</span>
        <input type="file" accept="image/*" id="file-${c.id}" hidden />
        <button class="btn" data-upload="${c.id}">📎 Upload</button>
        <button class="btn btn-primary" data-verify="${c.id}">✅ Submit Proof</button>
      </div>
    `;
    list.appendChild(row);
  }
}
renderChallenges();

document.addEventListener('click', (e)=>{
  const up = e.target.closest('button[data-upload]');
  if(up){ const id = up.getAttribute('data-upload'); document.getElementById(`file-${id}`).click(); }
});
const proofFiles = new Map();
document.addEventListener('change', (e)=>{
  if(e.target && e.target.type==='file' && e.target.id.startsWith('file-')){
    const id = e.target.id.replace('file-','');
    if(e.target.files && e.target.files[0]){
      proofFiles.set(id, e.target.files[0]);
      toast(`Selected proof for "${id}"`);
    }
  }
});
document.addEventListener('click', async (e)=>{
  const btn = e.target.closest('button[data-verify]'); if(!btn) return;
  const id = btn.getAttribute('data-verify'); const file = proofFiles.get(id);
  if(!file){ toast('Upload a proof image first', false); return; }
  btn.disabled = true; btn.textContent = 'Verifying…';
  try{
    const fd = new FormData(); fd.append('challengeId', id); fd.append('image', file);
    const res = await fetch('/api/verify', { method:'POST', body: fd });
    const data = await res.json();
    if(res.ok && data.ok){
      const who = localStorage.getItem(LAST_PLAYER) || "Player";
      const pts = challenges.find(c=>c.id===id).pts;
      upsertScore(who, pts);
      toast(`Verification successful! +${pts} pts`, true);
    } else { toast('Verification failed — could not confirm.', false); }
  }catch(err){ console.error(err); toast('Error during verification', false); }
  finally{ btn.disabled = false; btn.textContent = '✅ Submit Proof'; }
});
