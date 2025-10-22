// ============================================
// CO-OP Cinema - CLIENT APP
// ============================================

// Theater name generation
const adjectives = [
    "Stellar", "Cosmic", "Velvet", "Golden", "Silver",
    "Crimson", "Azure", "Emerald", "Royal", "Grand",
    "Imperial", "Majestic", "Classic", "Vintage", "Modern",
    "Electric", "Neon", "Starlight", "Moonlit", "Sunset"
];

const nouns = [
    "Cinema", "Theater", "Palace", "Auditorium", "Screen",
    "Pavilion", "Plaza", "Studio", "Hall", "Arena",
    "Dome", "Stage", "Lounge", "Gallery", "Showroom"
];

// Application state
let ws;
let currentRoom = null;
let myUserId = generateId();
let myUserName = "";
let isLocalAction = false;
let syncTimeout = null;

// ============================================
// UTILITY FUNCTIONS
// ============================================

function generateId() {
    return Math.random().toString(36).substr(2, 9);
}

function generateName() {
    const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    return `${adj} ${noun}`;
}

// ============================================
// ROOM MANAGEMENT
// ============================================

async function createRoom() {
    myUserName = document.getElementById('userName').value.trim();
    if (!myUserName) {
        alert('🎭 Please enter your theater name');
        return;
    }

    try {
        const response = await fetch('/generate-room');
        const data = await response.json();
        currentRoom = data.code;

        showRoom();
        connectWebSocket();
    } catch (error) {
        console.error('Error creating room:', error);
        alert('❌ Failed to create room. Please try again.');
    }
}

function joinRoom() {
    myUserName = document.getElementById('userName').value.trim();
    const roomCode = document.getElementById('roomCodeInput').value.trim().toLowerCase();

    if (!myUserName) {
        alert('🎭 Please enter your theater name');
        return;
    }

    if (!roomCode) {
        alert('🎫 Please enter a room code');
        return;
    }

    currentRoom = roomCode;
    showRoom();
    connectWebSocket();
}

function showRoom() {
    document.getElementById('lobby').style.display = 'none';
    document.getElementById('room').style.display = 'block';
    document.getElementById('roomCodeDisplay').textContent = currentRoom.toUpperCase();

    // Update URL without reloading
    const newUrl = `${window.location.origin}/?room=${currentRoom}`;
    window.history.pushState({}, '', newUrl);
}

function leaveRoom() {
    if (ws) ws.close();

    document.getElementById('lobby').style.display = 'block';
    document.getElementById('room').style.display = 'none';
    document.getElementById('videoPlayer').src = '';
    document.getElementById('dropZone').style.display = 'block';
    document.querySelector('.video-container').classList.remove('active');

    currentRoom = null;

    // Clear URL parameters
    window.history.pushState({}, '', window.location.origin);
}

function copyCode() {
    navigator.clipboard.writeText(currentRoom.toUpperCase());
    alert('📋 Room code copied to clipboard!');
}

function shareLink() {
    const url = `${window.location.origin}/?room=${currentRoom}`;
    navigator.clipboard.writeText(url);
    alert('🔗 Room link copied to clipboard!');
}

// ============================================
// WEBSOCKET CONNECTION
// ============================================

function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws?room=${currentRoom}&name=${encodeURIComponent(myUserName)}&id=${myUserId}`;

    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        console.log('✅ Connected to room:', currentRoom);
        document.getElementById('statusDot').className = 'status-dot connected';
        document.getElementById('statusText').textContent = 'Connected';
    };

    ws.onclose = () => {
        console.log('❌ Disconnected from room');
        document.getElementById('statusDot').className = 'status-dot disconnected';
        document.getElementById('statusText').textContent = 'Reconnecting...';

        // Auto-reconnect after 3 seconds
        setTimeout(() => {
            if (currentRoom) {
                console.log('🔄 Attempting to reconnect...');
                connectWebSocket();
            }
        }, 3000);
    };

    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
    };

    ws.onmessage = (event) => {
        handleMessage(JSON.parse(event.data));
    };
}

function handleMessage(msg) {
    if (msg.type === 'userList') {
        updateUserList(JSON.parse(msg.userName));
        return;
    }

    const video = document.getElementById('videoPlayer');
    if (!video.src) return;

    // Mark as remote action
    isLocalAction = false;

    // Clear any pending sync
    if (syncTimeout) {
        clearTimeout(syncTimeout);
    }

    // Batch rapid events with small delay
    syncTimeout = setTimeout(() => {
        const timeDiff = Math.abs(video.currentTime - msg.timestamp);

        if (msg.type === 'play') {
            // Only seek if time difference is significant
            if (timeDiff > 0.5) {
                video.currentTime = msg.timestamp;
            }
            video.play().catch(e => console.log('Play error:', e));
        } else if (msg.type === 'pause') {
            if (timeDiff > 0.5) {
                video.currentTime = msg.timestamp;
            }
            video.pause();
        } else if (msg.type === 'seek') {
            video.currentTime = msg.timestamp;
        }
    }, 50);
}

function sendMessage(type) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        const video = document.getElementById('videoPlayer');
        ws.send(JSON.stringify({
            type: type,
            timestamp: video.currentTime
        }));
    }
}

// ============================================
// USER LIST
// ============================================

function updateUserList(users) {
    const list = document.getElementById('usersList');
    list.innerHTML = '';

    users.forEach(user => {
        const badge = document.createElement('div');
        badge.className = 'user-badge' + (user.id === myUserId ? ' me' : '');
        badge.textContent = user.name + (user.id === myUserId ? ' (You)' : '');
        list.appendChild(badge);
    });
}

// ============================================
// VIDEO PLAYER EVENTS
// ============================================

const video = document.getElementById('videoPlayer');
let lastEventTime = 0;

function debounceEvent(callback, delay = 100) {
    const now = Date.now();
    if (now - lastEventTime > delay) {
        lastEventTime = now;
        callback();
    }
}

video.addEventListener('play', () => {
    if (isLocalAction) {
        debounceEvent(() => sendMessage('play'));
    }
    isLocalAction = true;
});

video.addEventListener('pause', () => {
    if (isLocalAction) {
        debounceEvent(() => sendMessage('pause'));
    }
    isLocalAction = true;
});

video.addEventListener('seeked', () => {
    if (isLocalAction) {
        debounceEvent(() => sendMessage('seek'), 200);
    }
    isLocalAction = true;
});

// ============================================
// FILE HANDLING
// ============================================

const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');

dropZone.addEventListener('click', () => {
    fileInput.click();
});

dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
});

dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragover');
});

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    handleFile(e.dataTransfer.files[0]);
});

fileInput.addEventListener('change', (e) => {
    handleFile(e.target.files[0]);
});

function handleFile(file) {
    if (file && file.type.startsWith('video/')) {
        const url = URL.createObjectURL(file);
        video.src = url;
        document.querySelector('.video-container').classList.add('active');
        dropZone.style.display = 'none';

        console.log('🎥 Video loaded:', file.name);
    } else {
        alert('⚠️ Please select a valid video file');
    }
}

// ============================================
// INITIALIZATION
// ============================================

// Set random theater name on load
document.getElementById('userName').value = generateName();

// Check for room in URL and auto-join
const urlParams = new URLSearchParams(window.location.search);
const roomFromUrl = urlParams.get('room');

if (roomFromUrl) {
    // Auto-fill room code and scroll to join section
    document.getElementById('roomCodeInput').value = roomFromUrl;

    // Auto-join if user clicks "Enter" or submits
    const roomInput = document.getElementById('roomCodeInput');
    roomInput.focus();

    // Optional: Auto-join after user enters name
    document.getElementById('userName').addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && roomFromUrl) {
            joinRoom();
        }
    });

    // Highlight the join section
    setTimeout(() => {
        document.getElementById('roomCodeInput').scrollIntoView({
            behavior: 'smooth',
            block: 'center'
        });
    }, 100);
}

// Allow Enter key to submit forms
document.getElementById('userName').addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !roomFromUrl) {
        createRoom();
    }
});

document.getElementById('roomCodeInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        joinRoom();
    }
});

console.log('🎬 Co-op Cinema initialized');
console.log('👤 Your ID:', myUserId);