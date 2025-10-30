// --- Imagga API Configuration ---
// --- Hugging Face Inference API Configuration ---
const HF_API_URL = 'https://api-inference.huggingface.co/models/google/vit-base-patch16-224';
const HF_API_TOKEN = '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'; // Optional: Add your Hugging Face token for higher rate limits

// --- NEW: Advanced Challenge Data with Stricter Rules ---
const challenges = [
    { 
        id: 'plant-sapling', 
        title: 'Plant a Sapling', 
        description: 'Plant a tree in your garden or a community area.', 
        points: 250, 
        icon: '🌳',
        keywords: [
            'tree', 'plant', 'sapling', 'gardening', 'soil', 'leaf',
            'flowerpot', 'greenhouse', 'shovel', 'garden', 'pot', 'nursery', 'glasshouse', 'ant', 'dung beetle'
        ],
        negativeKeywords: ['bottle', 'plastic', 'cup', 'trash', 'garbage', 'can'],
        minConfidence: 30
    },
    { 
        id: 'plastic-free-trash', 
        title: 'Plastic-Free Trash', 
        description: 'Show the trash bin without plastic in it.', 
        points: 150, 
        icon: '♻',
        keywords: [
            'trash bin', 'dustbin', 'garbage can', 'wastebin', 'trash barrel', 'ashcan', 'ash bin', 'ash-bin', 'ashbin',
            'hamper', 'crate', 'chest', 'shopping basket', 'paper', 'food', 'compost', 'organic', 'cardboard'
        ],
    negativeKeywords: ['plastic', 'plastic bag', 'bottle', 'wrapper', 'cup', 'container', 'trash bag', 'bags'],
        minConfidence: 30
    },
    { 
        id: 'mini-composter', 
        title: 'Build a Mini Composter', 
        description: 'Create a small compost bin for your kitchen scraps.', 
        points: 200, 
        icon: '🌱',
        keywords: [
            'compost', 'jar', 'soil', 'peel', 'food', 'bin',
            'trash bin', 'dustbin', 'garbage can', 'wastebin', 'trash barrel', 'ashcan', 'ash bin', 'ash-bin', 'ashbin',
            'hamper', 'crate', 'chest', 'shopping basket'
        ],
        negativeKeywords: ['plant', 'flower', 'tree'],
        minConfidence: 30
    }
];

// --- DOM Elements ---
const container = document.getElementById('challenge-container');
const playerNameInput = document.getElementById('challenge-player-name');
const imageUploader = document.getElementById('image-uploader');
const modal = document.getElementById('preview-modal');
const modalTitle = document.getElementById('modal-title');
const imagePreview = document.getElementById('image-preview');
const confirmBtn = document.getElementById('confirm-upload-btn');
const cancelBtn = document.getElementById('cancel-upload-btn');
const toastEl = document.getElementById('custom-toast');
const toastIconEl = document.getElementById('toast-icon');
const toastMessageEl = document.getElementById('toast-message');

let currentlyVerifyingChallenge = null;
let selectedFile = null;

let currentPlayerName = localStorage.getItem('ecogame.lastPlayer') || "";
if (playerNameInput) {
    playerNameInput.value = currentPlayerName;
    playerNameInput.addEventListener('change', () => {
        currentPlayerName = playerNameInput.value.trim();
        localStorage.setItem('ecogame.lastPlayer', currentPlayerName);
    });
}

// --- Local Storage Score Handling ---
function saveScoreToLocal(playerName, points) {
    // No local saving. Only backend saving will be used.
}

// --- Backend Score Handling ---
function saveScoreToBackend(playerName, points) {
    fetch('http://localhost:3000/api/leaderboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: playerName, total: points, game: 'Real-World Challenges' })
    })
    .then(res => {
        if (!res.ok) {
            return res.text().then(text => { console.error('POST error:', res.status, text); });
        }
        return res.json();
    })
    .catch(err => { console.error('POST fetch failed:', err); });
}

// --- Core Functions ---
function renderChallenges() {
    container.innerHTML = '';
    challenges.forEach(challenge => {
        const card = document.createElement('div');
        card.className = 'challenge-card';
        card.innerHTML = `
            <div class="challenge-icon">${challenge.icon}</div>
            <div class="challenge-info">
                <h3>${challenge.title}</h3>
                <p>${challenge.description}</p>
            </div>
            <div class="challenge-action">
                <span class="challenge-points">+${challenge.points} PTS</span>
                <button class="btn-primary" data-challenge-id="${challenge.id}">Submit Proof</button>
            </div>
        `;
        container.appendChild(card);
    });
}

function showCustomToast(message, isSuccess) {
    const successIcon = '<svg class="toast-svg" viewBox="0 0 52 52"><circle class="toast-svg-circle" cx="26" cy="26" r="25" fill="none"/><path class="toast-svg-path" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8"/></svg>';
    const errorIcon = '<svg class="toast-svg" viewBox="0 0 52 52"><circle class="toast-svg-circle" cx="26" cy="26" r="25" fill="none"/><path class="toast-svg-path" fill="none" d="M16 16 36 36 M36 16 16 36"/></svg>';
    if (toastIconEl) toastIconEl.innerHTML = isSuccess ? successIcon : errorIcon;
    if (toastMessageEl) toastMessageEl.textContent = message;
    if (toastEl) {
        toastEl.classList.remove('hidden', 'success', 'error');
        toastEl.classList.add(isSuccess ? 'success' : 'error');
        toastEl.classList.add('show');
        setTimeout(() => { toastEl.classList.remove('show'); }, 3000);
    }
}

function showModal(challenge) {
    currentlyVerifyingChallenge = challenge;
    modalTitle.textContent = `Submit for "${challenge.title}"`;
    modal.classList.remove('hidden');
    imagePreview.src = '#';
    selectedFile = null;
    imageUploader.value = '';
    imageUploader.style.display = 'block'; // Show uploader when modal opens
}

function hideModal() {
    modal.classList.add('hidden');
    imagePreview.src = '#';
    selectedFile = null;
    currentlyVerifyingChallenge = null;
    imageUploader.value = '';
    imageUploader.style.display = 'none'; // Hide uploader when modal closes
}

// --- NEW: Advanced Verification Logic for Imagga ---
function verifyImage() {
    if (!selectedFile || !currentlyVerifyingChallenge) return;

    const button = document.querySelector(`button[data-challenge-id="${currentlyVerifyingChallenge.id}"]`);
    if (button) button.textContent = "Verifying...";
    confirmBtn.textContent = "Verifying...";
    confirmBtn.disabled = true;
    cancelBtn.disabled = true;

    const reader = new FileReader();
    reader.onloadend = () => {
        // Detect mime type from DataURL
        const dataUrl = reader.result;
        const mimeMatch = /^data:(image\/\w+);base64,/.exec(dataUrl);
        const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
        const base64Data = dataUrl.split(',')[1];
        // Convert base64 to binary
        const byteCharacters = atob(base64Data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);

        fetch(HF_API_URL, {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': mimeType,
                ...(HF_API_TOKEN ? { 'Authorization': `Bearer ${HF_API_TOKEN}` } : {})
            },
            body: byteArray
        })
        .then(response => response.json())
        .then(data => {
            // Hugging Face returns labels in 'data' array
            if (Array.isArray(data) && data.length > 0) {
                const labels = data.map(obj => (obj.label || '').toLowerCase());
                console.log("HF Labels:", labels);
                const hasPositiveKeyword = currentlyVerifyingChallenge.keywords.some(keyword => labels.includes(keyword));
                const hasNegativeKeyword = currentlyVerifyingChallenge.negativeKeywords.some(keyword => labels.includes(keyword));
                if (hasPositiveKeyword && !hasNegativeKeyword) {
                    const playerName = (playerNameInput && playerNameInput.value.trim()) || "Player";
                    fetch('http://localhost:3000/api/leaderboard', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ name: playerName, total: currentlyVerifyingChallenge.points, game: 'Real-World Challenges' })
                    })
                    .then(res => res.json())
                    .then(respJson => {
                        console.log('Score POST response:', respJson);
                        showCustomToast("Image Submitted Was Correct", true);
                    })
                    .catch(err => {
                        console.error('POST fetch failed:', err);
                        showCustomToast('Failed to save score: ' + err, false);
                    });
                } else {
                    showCustomToast("Image Submitted Was Wrong", false);
                }
            } else {
                console.error("HF API Error Response:", data);
                showCustomToast("Could not analyze image.", false);
            }
        })
        .catch(error => {
            console.error("HF Fetch Error:", error);
            showCustomToast("An error occurred during verification.", false);
        })
        .finally(() => {
            if (button) button.textContent = "Submit Proof";
            confirmBtn.textContent = "Verify Image";
            confirmBtn.disabled = false;
            cancelBtn.disabled = false;
            hideModal();
        });
    };
    reader.readAsDataURL(selectedFile);
}

// --- Event Listeners ---
container.addEventListener('click', (e) => {
    if (e.target && e.target.matches('button[data-challenge-id]')) {
        const challengeId = e.target.dataset.challengeId;
        const challenge = challenges.find(c => c.id === challengeId);
        if (challenge) {
            showModal(challenge);
            // Automatically trigger file input dialog for user convenience
            setTimeout(() => {
                imageUploader.click();
            }, 200);
        }
    }
});

imageUploader.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
        selectedFile = e.target.files[0];
        imagePreview.src = URL.createObjectURL(selectedFile);
    } else {
        hideModal();
    }
});

confirmBtn.addEventListener('click', verifyImage);
cancelBtn.addEventListener('click', hideModal);
modal.addEventListener('click', (e) => {
    if (e.target === modal) {
        hideModal();
    }
});

// Initial Render
renderChallenges();