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

// Source state: 'file' | 'youtube' | 'vimeo' | 'twitch' | 'dailymotion' | 'none'
let currentSource = 'none';
let currentSourceUrl = '';

// YouTube state
let ytPlayer = null;
let ytReady = false;
let ytLastKnownTime = 0;
let ytIgnoreStateChange = false;

// Vimeo state
let vimeoPlayer = null;
let vimeoIgnoreEvents = false;

// Twitch state
let twitchEmbed = null;
let twitchPlayer = null;
let twitchIgnoreEvents = false;
let twitchIsLive = false;

// Dailymotion state
let dmPlayer = null;
let dmReady = false;
let dmIgnoreEvents = false;

// Chat state
let chatOpen = false;

// Host/viewer roles
let isHost = false;
let hostMode = false; // when true, only host controls sync
let hostUserId = null;
let roomUsers = [];
let isRoomCreator = false;

// Buffering sync
let peersBuffering = new Set();
let wasPlayingBeforeBuffer = false;

// Playback status
let lastStatusSent = '';
let statusInterval = null;

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

function extractYouTubeId(url) {
    const patterns = [
        /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
        /^([a-zA-Z0-9_-]{11})$/
    ];
    for (const p of patterns) {
        const m = url.match(p);
        if (m) return m[1];
    }
    return null;
}

function extractVimeoId(url) {
    const m = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
    return m ? m[1] : null;
}

function extractTwitchChannel(url) {
    // twitch.tv/channelname or twitch.tv/videos/123456
    const vodMatch = url.match(/twitch\.tv\/videos\/(\d+)/);
    if (vodMatch) return { type: 'video', id: vodMatch[1] };
    const channelMatch = url.match(/twitch\.tv\/([a-zA-Z0-9_]+)/);
    if (channelMatch) return { type: 'channel', id: channelMatch[1] };
    return null;
}

function extractDailymotionId(url) {
    const m = url.match(/dailymotion\.com\/video\/([a-zA-Z0-9]+)/);
    if (m) return m[1];
    const m2 = url.match(/dai\.ly\/([a-zA-Z0-9]+)/);
    return m2 ? m2[1] : null;
}

function detectSourceType(url) {
    if (/youtube\.com|youtu\.be/.test(url)) return 'youtube';
    if (/vimeo\.com/.test(url)) return 'vimeo';
    if (/twitch\.tv/.test(url)) return 'twitch';
    if (/dailymotion\.com|dai\.ly/.test(url)) return 'dailymotion';
    return 'directurl';
}

// ============================================
// ROOM MANAGEMENT
// ============================================

async function createRoom() {
    myUserName = document.getElementById('userName').value.trim();
    if (!myUserName) {
        alert('Please enter your theater name');
        return;
    }

    try {
        const response = await fetch('/generate-room');
        const data = await response.json();
        currentRoom = data.code;
        isRoomCreator = true;

        showRoom();
        connectWebSocket();
        saveRoomToStorage();
    } catch (error) {
        console.error('Error creating room:', error);
        alert('Failed to create room. Please try again.');
    }
}

function joinRoom() {
    myUserName = document.getElementById('userName').value.trim();
    const roomCode = document.getElementById('roomCodeInput').value.trim().toLowerCase();

    if (!myUserName) {
        alert('Please enter your theater name');
        return;
    }

    if (!roomCode) {
        alert('Please enter a room code');
        return;
    }

    currentRoom = roomCode;
    isRoomCreator = false;
    showRoom();
    connectWebSocket();
    saveRoomToStorage();
}

function showRoom() {
    document.getElementById('lobby').style.display = 'none';
    document.getElementById('room').style.display = 'block';
    document.getElementById('roomCodeDisplay').textContent = currentRoom.toUpperCase();
    document.getElementById('chatFab').style.display = 'flex';

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
    hideAllPlayers();
    document.getElementById('videoUrlInput').value = '';
    document.querySelector('.yt-divider').style.display = '';
    document.getElementById('urlInputGroup').style.display = '';
    document.getElementById('reactionBar').style.display = 'none';
    document.getElementById('customControlsBar').style.display = 'none';
    hideYTControls();
    if (isFullscreen()) toggleCustomFullscreen();

    if (ytPlayer && ytPlayer.destroy) {
        ytPlayer.destroy();
        ytPlayer = null;
        ytReady = false;
    }
    if (vimeoPlayer) {
        vimeoPlayer.destroy();
        vimeoPlayer = null;
    }
    if (twitchEmbed) {
        document.getElementById('twitchPlayerContainer').innerHTML = '';
        twitchEmbed = null;
        twitchPlayer = null;
    }
    if (dmPlayer) {
        document.getElementById('dailymotionPlayerContainer').innerHTML = '';
        dmPlayer = null;
        dmReady = false;
    }

    currentSource = 'none';
    currentSourceUrl = '';
    currentRoom = null;
    isHost = false;
    hostMode = false;
    hostUserId = null;
    isRoomCreator = false;
    peersBuffering.clear();
    chatOpen = false;
    document.getElementById('chatSidebar').classList.remove('open');
    document.getElementById('chatMessages').innerHTML = '';
    document.getElementById('chatFab').style.display = 'none';

    if (statusInterval) {
        clearInterval(statusInterval);
        statusInterval = null;
    }

    clearRoomStorage();
    window.history.pushState({}, '', window.location.origin);
}

function copyCode() {
    navigator.clipboard.writeText(currentRoom.toUpperCase());
    alert('Room code copied to clipboard!');
}

function shareLink() {
    const url = `${window.location.origin}/?room=${currentRoom}`;
    navigator.clipboard.writeText(url);
    alert('Room link copied to clipboard!');
}

// ============================================
// ROOM PERSISTENCE (localStorage)
// ============================================

function saveRoomToStorage() {
    localStorage.setItem('coopcinema_room', JSON.stringify({
        room: currentRoom,
        userName: myUserName
    }));
}

function clearRoomStorage() {
    localStorage.removeItem('coopcinema_room');
}

function checkRejoin() {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('room')) return; // URL already has room

    const saved = localStorage.getItem('coopcinema_room');
    if (saved) {
        const data = JSON.parse(saved);
        document.getElementById('rejoinModal').style.display = 'flex';
        document.getElementById('rejoinModal').dataset.room = data.room;
        document.getElementById('rejoinModal').dataset.userName = data.userName;
    }
}

function rejoinLastRoom() {
    const modal = document.getElementById('rejoinModal');
    const room = modal.dataset.room;
    const name = modal.dataset.userName;
    modal.style.display = 'none';

    document.getElementById('userName').value = name;
    document.getElementById('roomCodeInput').value = room;
    joinRoom();
}

function dismissRejoin() {
    document.getElementById('rejoinModal').style.display = 'none';
    clearRoomStorage();
}

// ============================================
// WEBSOCKET CONNECTION
// ============================================

function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws?room=${currentRoom}&name=${encodeURIComponent(myUserName)}&id=${myUserId}`;

    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        console.log('Connected to room:', currentRoom);
        document.getElementById('statusDot').className = 'status-dot connected';
        document.getElementById('statusText').textContent = 'Connected';
        startStatusUpdates();
    };

    ws.onclose = () => {
        console.log('Disconnected from room');
        document.getElementById('statusDot').className = 'status-dot disconnected';
        document.getElementById('statusText').textContent = 'Reconnecting...';

        if (statusInterval) {
            clearInterval(statusInterval);
            statusInterval = null;
        }

        setTimeout(() => {
            if (currentRoom) {
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
        const users = JSON.parse(msg.userName);
        roomUsers = users;
        updateUserList(users);
        handleUserListForStateSync(users);
        updateHostUI();
        return;
    }

    // Source loading messages
    if (msg.type === 'youtube') {
        loadYouTube(msg.url, false);
        return;
    }
    if (msg.type === 'directurl') {
        loadDirectUrl(msg.url, false);
        return;
    }
    if (msg.type === 'vimeo') {
        loadVimeo(msg.url, false);
        return;
    }
    if (msg.type === 'twitch') {
        loadTwitch(msg.url, false);
        return;
    }
    if (msg.type === 'dailymotion') {
        loadDailymotion(msg.url, false);
        return;
    }

    // Chat
    if (msg.type === 'chat') {
        displayChatMessage(msg.userName, msg.content, false);
        return;
    }

    // Reactions
    if (msg.type === 'reaction') {
        showReactionAnimation(msg.content, msg.userName);
        return;
    }

    // Playback status
    if (msg.type === 'status') {
        updateUserStatus(msg.userID, msg.content);
        return;
    }

    // State sync (for new joiners)
    if (msg.type === 'state') {
        handleStateSync(msg);
        return;
    }

    // Buffering sync
    if (msg.type === 'buffering') {
        peersBuffering.add(msg.userID);
        pauseForBuffering();
        return;
    }
    if (msg.type === 'bufferend') {
        peersBuffering.delete(msg.userID);
        if (peersBuffering.size === 0) resumeAfterBuffering();
        return;
    }

    // Host mode changes
    if (msg.type === 'hostchange') {
        hostUserId = msg.userID;
        hostMode = true;
        isHost = (myUserId === hostUserId);
        updateHostUI();
        return;
    }
    if (msg.type === 'hostmodeoff') {
        hostMode = false;
        updateHostUI();
        return;
    }

    // Playback sync (play/pause/seek)
    handlePlaybackSync(msg);
}

function handlePlaybackSync(msg) {
    // In host mode, ignore sync from non-host
    if (hostMode && msg.userID !== hostUserId) return;

    const sentAt = msg.sentAt || 0;
    const latencyOffset = sentAt ? (Date.now() - sentAt) / 2000 : 0; // seconds

    if (currentSource === 'youtube') {
        if (!ytPlayer || !ytReady) return;
        isLocalAction = false;
        if (syncTimeout) clearTimeout(syncTimeout);
        syncTimeout = setTimeout(() => {
            const currentTime = ytPlayer.getCurrentTime();
            const target = msg.timestamp + latencyOffset;
            const timeDiff = Math.abs(currentTime - target);
            ytIgnoreStateChange = true;
            if (msg.type === 'play') {
                if (timeDiff > 0.5) ytPlayer.seekTo(target, true);
                ytPlayer.playVideo();
            } else if (msg.type === 'pause') {
                if (timeDiff > 0.5) ytPlayer.seekTo(target, true);
                ytPlayer.pauseVideo();
            } else if (msg.type === 'seek') {
                ytPlayer.seekTo(target, true);
            }
            setTimeout(() => { ytIgnoreStateChange = false; }, 500);
        }, 50);
        return;
    }

    if (currentSource === 'vimeo') {
        if (!vimeoPlayer) return;
        isLocalAction = false;
        if (syncTimeout) clearTimeout(syncTimeout);
        syncTimeout = setTimeout(() => {
            vimeoIgnoreEvents = true;
            const target = msg.timestamp + latencyOffset;
            if (msg.type === 'play') {
                vimeoPlayer.setCurrentTime(target).then(() => vimeoPlayer.play());
            } else if (msg.type === 'pause') {
                vimeoPlayer.setCurrentTime(target).then(() => vimeoPlayer.pause());
            } else if (msg.type === 'seek') {
                vimeoPlayer.setCurrentTime(target);
            }
            setTimeout(() => { vimeoIgnoreEvents = false; }, 500);
        }, 50);
        return;
    }

    if (currentSource === 'twitch') {
        if (!twitchPlayer || twitchIsLive) return;
        isLocalAction = false;
        if (syncTimeout) clearTimeout(syncTimeout);
        syncTimeout = setTimeout(() => {
            twitchIgnoreEvents = true;
            const target = msg.timestamp + latencyOffset;
            if (msg.type === 'play') {
                twitchPlayer.seek(target);
                twitchPlayer.play();
            } else if (msg.type === 'pause') {
                twitchPlayer.seek(target);
                twitchPlayer.pause();
            } else if (msg.type === 'seek') {
                twitchPlayer.seek(target);
            }
            setTimeout(() => { twitchIgnoreEvents = false; }, 500);
        }, 50);
        return;
    }

    if (currentSource === 'dailymotion') {
        if (!dmPlayer || !dmReady) return;
        isLocalAction = false;
        if (syncTimeout) clearTimeout(syncTimeout);
        syncTimeout = setTimeout(() => {
            dmIgnoreEvents = true;
            const target = msg.timestamp + latencyOffset;
            if (msg.type === 'play') {
                dmPlayer.seek(target);
                dmPlayer.play();
            } else if (msg.type === 'pause') {
                dmPlayer.seek(target);
                dmPlayer.pause();
            } else if (msg.type === 'seek') {
                dmPlayer.seek(target);
            }
            setTimeout(() => { dmIgnoreEvents = false; }, 500);
        }, 50);
        return;
    }

    // File-based video
    const video = document.getElementById('videoPlayer');
    if (!video.src) return;
    isLocalAction = false;
    if (syncTimeout) clearTimeout(syncTimeout);
    syncTimeout = setTimeout(() => {
        const target = msg.timestamp + latencyOffset;
        const timeDiff = Math.abs(video.currentTime - target);
        if (msg.type === 'play') {
            if (timeDiff > 0.5) video.currentTime = target;
            video.play().catch(e => console.log('Play error:', e));
        } else if (msg.type === 'pause') {
            if (timeDiff > 0.5) video.currentTime = target;
            video.pause();
        } else if (msg.type === 'seek') {
            video.currentTime = target;
        }
    }, 50);
}

function sendMessage(type) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    if (hostMode && !isHost) return; // in host mode, only host sends sync

    let timestamp = 0;
    if (currentSource === 'youtube' && ytPlayer && ytReady) {
        timestamp = ytPlayer.getCurrentTime();
    } else if (currentSource === 'vimeo' && vimeoPlayer) {
        // vimeo getCurrentTime is async, but we cache it
        timestamp = vimeoLastTime || 0;
    } else if (currentSource === 'twitch' && twitchPlayer) {
        timestamp = twitchPlayer.getCurrentTime() || 0;
    } else if (currentSource === 'dailymotion' && dmPlayer && dmReady) {
        timestamp = dmPlayer.currentTime || 0;
    } else {
        const video = document.getElementById('videoPlayer');
        timestamp = video.currentTime;
    }

    ws.send(JSON.stringify({
        type: type,
        timestamp: timestamp,
        sentAt: Date.now()
    }));
}

// ============================================
// USER LIST
// ============================================

// Track user statuses
const userStatuses = {};

function updateUserList(users) {
    const list = document.getElementById('usersList');
    list.innerHTML = '';

    users.forEach(user => {
        const badge = document.createElement('div');
        badge.className = 'user-badge' + (user.id === myUserId ? ' me' : '');
        badge.id = 'user-badge-' + user.id;

        let statusIcon = '';
        const st = userStatuses[user.id];
        if (st === 'playing') statusIcon = '<span class="user-status-icon playing">&#9654;</span>';
        else if (st === 'paused') statusIcon = '<span class="user-status-icon paused">&#9208;</span>';
        else if (st === 'buffering') statusIcon = '<span class="user-status-icon buffering">&#9203;</span>';

        const hostCrown = (hostMode && user.id === hostUserId) ? '<span class="host-crown">👑</span>' : '';

        badge.innerHTML = hostCrown + statusIcon + user.name + (user.id === myUserId ? ' (You)' : '');

        // Host transfer: click another user's badge to transfer host
        if (isHost && hostMode && user.id !== myUserId) {
            badge.style.cursor = 'pointer';
            badge.title = 'Click to transfer host';
            badge.addEventListener('click', () => transferHost(user.id));
        }

        list.appendChild(badge);
    });
}

function updateUserStatus(userId, status) {
    userStatuses[userId] = status;
    const badge = document.getElementById('user-badge-' + userId);
    if (!badge) return;
    // Re-render will happen on next user list update; for immediate feedback:
    let icon = '';
    if (status === 'playing') icon = '&#9654;';
    else if (status === 'paused') icon = '&#9208;';
    else if (status === 'buffering') icon = '&#9203;';
    const iconEl = badge.querySelector('.user-status-icon');
    if (iconEl) {
        iconEl.innerHTML = icon;
        iconEl.className = 'user-status-icon ' + status;
    }
}

// ============================================
// AUTO-REJOIN STATE SYNC
// ============================================

function handleUserListForStateSync(users) {
    // When a new user joins, the client with the lowest userId sends state
    if (currentSource === 'none') return;
    if (users.length < 2) return;

    // Find lowest userId among all users
    const sortedIds = users.map(u => u.id).sort();
    if (sortedIds[0] !== myUserId) return; // only lowest responds

    // Send current state
    let timestamp = 0;
    let playing = false;

    if (currentSource === 'youtube' && ytPlayer && ytReady) {
        timestamp = ytPlayer.getCurrentTime();
        playing = ytPlayer.getPlayerState() === YT.PlayerState.PLAYING;
    } else if (currentSource === 'vimeo' && vimeoPlayer) {
        timestamp = vimeoLastTime || 0;
        playing = vimeoIsPlaying || false;
    } else if (currentSource === 'twitch' && twitchPlayer) {
        timestamp = twitchPlayer.getCurrentTime() || 0;
        playing = !twitchPlayer.isPaused();
    } else if (currentSource === 'dailymotion' && dmPlayer && dmReady) {
        timestamp = dmPlayer.currentTime || 0;
        playing = !dmPlayer.paused;
    } else {
        const video = document.getElementById('videoPlayer');
        if (video.src) {
            timestamp = video.currentTime;
            playing = !video.paused;
        }
    }

    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'state',
            sourceType: currentSource,
            url: currentSourceUrl,
            timestamp: timestamp,
            playing: playing,
            sentAt: Date.now()
        }));
    }
}

function handleStateSync(msg) {
    if (currentSource !== 'none') return; // already watching something

    const srcType = msg.sourceType;
    const url = msg.url;
    if (!srcType || srcType === 'none' || !url) return;

    // Load the source
    if (srcType === 'youtube') {
        loadYouTube(url, false);
    } else if (srcType === 'vimeo') {
        loadVimeo(url, false);
    } else if (srcType === 'twitch') {
        loadTwitch(url, false);
    } else if (srcType === 'dailymotion') {
        loadDailymotion(url, false);
    } else if (srcType === 'file') {
        loadDirectUrl(url, false);
    }

    // After load, seek to timestamp and set play state
    setTimeout(() => {
        const target = msg.timestamp || 0;
        if (srcType === 'youtube' && ytPlayer && ytReady) {
            ytPlayer.seekTo(target, true);
            if (msg.playing) ytPlayer.playVideo(); else ytPlayer.pauseVideo();
        } else if (srcType === 'vimeo' && vimeoPlayer) {
            vimeoPlayer.setCurrentTime(target).then(() => {
                if (msg.playing) vimeoPlayer.play(); else vimeoPlayer.pause();
            });
        } else if (srcType === 'twitch' && twitchPlayer) {
            twitchPlayer.seek(target);
            if (msg.playing) twitchPlayer.play(); else twitchPlayer.pause();
        } else if (srcType === 'dailymotion' && dmPlayer && dmReady) {
            dmPlayer.seek(target);
            if (msg.playing) dmPlayer.play(); else dmPlayer.pause();
        } else {
            const video = document.getElementById('videoPlayer');
            if (video.src) {
                video.currentTime = target;
                if (msg.playing) video.play().catch(() => {});
                else video.pause();
            }
        }
    }, 2000); // give player time to initialize
}

// ============================================
// UNIFIED URL INPUT + AUTO-DETECTION
// ============================================

function onLoadUrlClick() {
    const url = document.getElementById('videoUrlInput').value.trim();
    if (!url) {
        alert('Please enter a video URL');
        return;
    }

    const sourceType = detectSourceType(url);

    if (sourceType === 'youtube') {
        const videoId = extractYouTubeId(url);
        if (!videoId) {
            alert('Could not extract a valid YouTube video ID');
            return;
        }
        loadYouTube(videoId, true);
    } else if (sourceType === 'vimeo') {
        const videoId = extractVimeoId(url);
        if (!videoId) {
            alert('Could not extract a valid Vimeo video ID');
            return;
        }
        loadVimeo(videoId, true);
    } else if (sourceType === 'twitch') {
        const info = extractTwitchChannel(url);
        if (!info) {
            alert('Could not extract Twitch channel or VOD');
            return;
        }
        loadTwitch(JSON.stringify(info), true);
    } else if (sourceType === 'dailymotion') {
        const videoId = extractDailymotionId(url);
        if (!videoId) {
            alert('Could not extract Dailymotion video ID');
            return;
        }
        loadDailymotion(videoId, true);
    } else {
        // Direct URL
        loadDirectUrl(url, true);
    }
}

// URL detection hint as user types
function updateUrlHint() {
    const url = document.getElementById('videoUrlInput').value.trim();
    const hint = document.getElementById('urlDetectHint');
    if (!url) { hint.textContent = ''; return; }
    const type = detectSourceType(url);
    const labels = {
        youtube: 'YouTube video detected',
        vimeo: 'Vimeo video detected',
        twitch: 'Twitch stream/VOD detected',
        dailymotion: 'Dailymotion video detected',
        directurl: 'Direct video URL'
    };
    hint.textContent = labels[type] || '';
}

// ============================================
// HIDE/SHOW PLAYERS
// ============================================

function hideAllPlayers() {
    document.getElementById('videoPlayer').style.display = 'none';
    document.getElementById('youtubePlayerContainer').style.display = 'none';
    document.getElementById('vimeoPlayerContainer').style.display = 'none';
    document.getElementById('twitchPlayerContainer').style.display = 'none';
    document.getElementById('dailymotionPlayerContainer').style.display = 'none';
}

function activatePlayerView() {
    document.getElementById('dropZone').style.display = 'none';
    document.querySelector('.yt-divider').style.display = 'none';
    document.getElementById('urlInputGroup').style.display = 'none';
    document.querySelector('.video-container').classList.add('active');
    document.getElementById('reactionBar').style.display = 'flex';
    document.getElementById('customControlsBar').style.display = 'flex';
}

// ============================================
// YOUTUBE PLAYER
// ============================================

function onYouTubeIframeAPIReady() {
    console.log('YouTube IFrame API ready');
}

function loadYouTube(videoId, broadcast) {
    currentSource = 'youtube';
    currentSourceUrl = videoId;
    hideAllPlayers();
    activatePlayerView();
    document.getElementById('youtubePlayerContainer').style.display = 'block';

    if (ytPlayer && ytReady) {
        ytPlayer.loadVideoById(videoId);
    } else {
        ytPlayer = new YT.Player('youtubePlayerContainer', {
            videoId: videoId,
            playerVars: { autoplay: 0, controls: 1, rel: 0, modestbranding: 1 },
            events: { onReady: onYTPlayerReady, onStateChange: onYTStateChange }
        });
    }

    if (broadcast && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'youtube', url: videoId }));
    }
}

function onYTPlayerReady() {
    ytReady = true;
    ytLastKnownTime = 0;
    showYTControls();
}

function onYTStateChange(event) {
    if (ytIgnoreStateChange) return;

    const currentTime = ytPlayer.getCurrentTime();
    const timeDiff = Math.abs(currentTime - ytLastKnownTime);

    if (event.data === YT.PlayerState.PLAYING) {
        if (timeDiff > 1) sendMessage('seek');
        sendMessage('play');
    } else if (event.data === YT.PlayerState.PAUSED) {
        if (timeDiff > 1) sendMessage('seek');
        sendMessage('pause');
    } else if (event.data === YT.PlayerState.BUFFERING) {
        sendBuffering(true);
    }

    if (event.data === YT.PlayerState.PLAYING || event.data === YT.PlayerState.PAUSED) {
        sendBuffering(false);
    }

    ytLastKnownTime = currentTime;
}

// ============================================
// VIMEO PLAYER
// ============================================

let vimeoLastTime = 0;
let vimeoIsPlaying = false;

function loadVimeo(videoId, broadcast) {
    currentSource = 'vimeo';
    currentSourceUrl = videoId;
    hideAllPlayers();
    activatePlayerView();

    const container = document.getElementById('vimeoPlayerContainer');
    container.style.display = 'block';
    container.innerHTML = '';

    vimeoPlayer = new Vimeo.Player(container, {
        id: videoId,
        width: '100%',
        autoplay: false
    });

    vimeoPlayer.on('play', () => {
        vimeoIsPlaying = true;
        if (!vimeoIgnoreEvents) sendMessage('play');
        sendBuffering(false);
    });
    vimeoPlayer.on('pause', () => {
        vimeoIsPlaying = false;
        if (!vimeoIgnoreEvents) sendMessage('pause');
    });
    vimeoPlayer.on('seeked', (data) => {
        vimeoLastTime = data.seconds;
        if (!vimeoIgnoreEvents) sendMessage('seek');
    });
    vimeoPlayer.on('timeupdate', (data) => {
        vimeoLastTime = data.seconds;
    });
    vimeoPlayer.on('bufferstart', () => sendBuffering(true));
    vimeoPlayer.on('bufferend', () => sendBuffering(false));

    if (broadcast && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'vimeo', url: videoId }));
    }
}

// ============================================
// TWITCH PLAYER
// ============================================

function loadTwitch(infoStr, broadcast) {
    currentSource = 'twitch';
    currentSourceUrl = infoStr;
    hideAllPlayers();
    activatePlayerView();

    const container = document.getElementById('twitchPlayerContainer');
    container.style.display = 'block';
    container.innerHTML = '';

    let info;
    try { info = JSON.parse(infoStr); } catch { info = { type: 'channel', id: infoStr }; }

    const opts = {
        width: '100%',
        height: '100%',
        parent: [window.location.hostname]
    };

    if (info.type === 'video') {
        opts.video = info.id;
        twitchIsLive = false;
    } else {
        opts.channel = info.id;
        twitchIsLive = true;
    }

    twitchEmbed = new Twitch.Embed(container.id, opts);

    twitchEmbed.addEventListener(Twitch.Embed.VIDEO_READY, () => {
        twitchPlayer = twitchEmbed.getPlayer();
        twitchPlayer.addEventListener(Twitch.Player.PLAY, () => {
            if (!twitchIgnoreEvents && !twitchIsLive) sendMessage('play');
        });
        twitchPlayer.addEventListener(Twitch.Player.PAUSE, () => {
            if (!twitchIgnoreEvents && !twitchIsLive) sendMessage('pause');
        });
    });

    if (broadcast && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'twitch', url: infoStr }));
    }
}

// ============================================
// DAILYMOTION PLAYER
// ============================================

function loadDailymotion(videoId, broadcast) {
    currentSource = 'dailymotion';
    currentSourceUrl = videoId;
    hideAllPlayers();
    activatePlayerView();

    const container = document.getElementById('dailymotionPlayerContainer');
    container.style.display = 'block';
    container.innerHTML = '';

    // Use Dailymotion iframe embed
    const iframe = document.createElement('iframe');
    iframe.src = `https://www.dailymotion.com/embed/video/${videoId}?api=postMessage`;
    iframe.width = '100%';
    iframe.height = '100%';
    iframe.frameBorder = '0';
    iframe.allow = 'autoplay; fullscreen';
    iframe.allowFullscreen = true;
    iframe.id = 'dmIframe';
    container.appendChild(iframe);

    // Use postMessage API for Dailymotion
    dmReady = true;
    dmPlayer = {
        currentTime: 0,
        paused: true,
        iframe: iframe,
        _postCommand(cmd, args) {
            iframe.contentWindow.postMessage(JSON.stringify({ command: cmd, parameters: args || [] }), '*');
        },
        play() { this._postCommand('play'); this.paused = false; },
        pause() { this._postCommand('pause'); this.paused = true; },
        seek(t) { this._postCommand('seek', [t]); this.currentTime = t; }
    };

    // Listen for events from the iframe
    const dmHandler = (e) => {
        if (!e.data || typeof e.data !== 'string') return;
        try {
            const data = JSON.parse(e.data);
            if (data.event === 'timechange' || data.event === 'timeupdate') {
                dmPlayer.currentTime = data.time || 0;
            }
            if (data.event === 'play' && !dmIgnoreEvents) {
                dmPlayer.paused = false;
                sendMessage('play');
            }
            if (data.event === 'pause' && !dmIgnoreEvents) {
                dmPlayer.paused = true;
                sendMessage('pause');
            }
            if (data.event === 'seeked' && !dmIgnoreEvents) {
                sendMessage('seek');
            }
        } catch {}
    };
    window.addEventListener('message', dmHandler);

    if (broadcast && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'dailymotion', url: videoId }));
    }
}

// ============================================
// DIRECT URL PLAYER
// ============================================

function loadDirectUrl(url, broadcast) {
    currentSource = 'file';
    currentSourceUrl = url;
    hideAllPlayers();
    activatePlayerView();

    const video = document.getElementById('videoPlayer');
    video.style.display = 'block';
    video.src = url;

    if (broadcast && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'directurl', url: url }));
    }
}

// ============================================
// VIDEO PLAYER EVENTS (local file / direct URL)
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
    if (currentSource !== 'file') return;
    if (isLocalAction) {
        debounceEvent(() => sendMessage('play'));
    }
    isLocalAction = true;
    sendBuffering(false);
});

video.addEventListener('pause', () => {
    if (currentSource !== 'file') return;
    if (isLocalAction) {
        debounceEvent(() => sendMessage('pause'));
    }
    isLocalAction = true;
});

video.addEventListener('seeked', () => {
    if (currentSource !== 'file') return;
    if (isLocalAction) {
        debounceEvent(() => sendMessage('seek'), 200);
    }
    isLocalAction = true;
});

video.addEventListener('waiting', () => {
    if (currentSource === 'file') sendBuffering(true);
});

video.addEventListener('playing', () => {
    if (currentSource === 'file') sendBuffering(false);
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
        currentSource = 'file';
        const url = URL.createObjectURL(file);
        video.src = url;
        hideAllPlayers();
        video.style.display = 'block';
        activatePlayerView();
    } else {
        alert('Please select a valid video file');
    }
}

// ============================================
// CHAT
// ============================================

// Notification sound using Web Audio API
let audioCtx = null;
function playChatNotifSound() {
    try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, audioCtx.currentTime);
        osc.frequency.setValueAtTime(1046, audioCtx.currentTime + 0.08);
        gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.25);
        osc.start(audioCtx.currentTime);
        osc.stop(audioCtx.currentTime + 0.25);
    } catch (e) {
        // Audio not available, ignore
    }
}

function toggleChat() {
    chatOpen = !chatOpen;
    document.getElementById('chatSidebar').classList.toggle('open', chatOpen);
    if (chatOpen) {
        // Clear all toasts when opening chat
        clearAllToasts();
        // Focus input
        setTimeout(() => document.getElementById('chatInput').focus(), 300);
    }
}

function sendChat() {
    const input = document.getElementById('chatInput');
    const text = input.value.trim();
    if (!text || !ws || ws.readyState !== WebSocket.OPEN) return;

    ws.send(JSON.stringify({
        type: 'chat',
        content: text,
        userName: myUserName
    }));

    displayChatMessage(myUserName, text, true);
    input.value = '';
}

function displayChatMessage(userName, content, isMe) {
    const container = document.getElementById('chatMessages');
    const msg = document.createElement('div');
    msg.className = 'chat-msg' + (isMe ? ' me' : '') + (!isMe ? ' new-msg' : '');

    const nameEl = document.createElement('div');
    nameEl.className = 'chat-msg-name';
    nameEl.textContent = userName;

    const textEl = document.createElement('div');
    textEl.className = 'chat-msg-text';
    textEl.textContent = content;

    const timeEl = document.createElement('div');
    timeEl.className = 'chat-msg-time';
    timeEl.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    msg.appendChild(nameEl);
    msg.appendChild(textEl);
    msg.appendChild(timeEl);
    container.appendChild(msg);
    container.scrollTop = container.scrollHeight;

    // Notification for incoming messages
    if (!isMe) {
        playChatNotifSound();
        // Show toast popup only when chat is closed
        if (!chatOpen) {
            showChatToast(userName, content);
        }
    }
}

function showChatToast(userName, content) {
    const container = document.getElementById('chatToastContainer');

    // Limit to 5 visible toasts max — remove oldest if exceeded
    const existing = container.querySelectorAll('.chat-toast:not(.fade-out)');
    if (existing.length >= 5) {
        const oldest = existing[0];
        oldest.classList.add('fade-out');
        setTimeout(() => { if (oldest.parentNode) oldest.remove(); }, 400);
    }

    const toast = document.createElement('div');
    toast.className = 'chat-toast';

    const nameEl = document.createElement('div');
    nameEl.className = 'chat-toast-name';
    nameEl.textContent = userName;

    const textEl = document.createElement('div');
    textEl.className = 'chat-toast-text';
    textEl.textContent = content;

    toast.appendChild(nameEl);
    toast.appendChild(textEl);

    toast.addEventListener('click', () => {
        clearAllToasts();
        if (!chatOpen) toggleChat();
    });

    container.appendChild(toast);

    // Auto-dismiss after 4s with fade-out
    setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => { if (toast.parentNode) toast.remove(); }, 400);
    }, 4000);
}

function clearAllToasts() {
    const container = document.getElementById('chatToastContainer');
    container.innerHTML = '';
}

// ============================================
// REACTIONS
// ============================================

function sendReaction(emoji) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'reaction', content: emoji, userName: myUserName }));
    showReactionAnimation(emoji, myUserName);
}

function showReactionAnimation(emoji, userName) {
    const overlay = document.getElementById('reactionOverlay');
    const el = document.createElement('div');
    el.className = 'floating-reaction';
    el.style.left = (20 + Math.random() * 60) + '%';

    const emojiSpan = document.createElement('span');
    emojiSpan.textContent = emoji;
    el.appendChild(emojiSpan);

    if (userName) {
        const nameEl = document.createElement('span');
        nameEl.className = 'floating-reaction-name';
        nameEl.textContent = userName;
        el.appendChild(nameEl);
    }

    overlay.appendChild(el);
    el.addEventListener('animationend', () => el.remove());
}

// ============================================
// PLAYBACK STATUS INDICATORS
// ============================================

function startStatusUpdates() {
    sendPlaybackStatus();
    statusInterval = setInterval(sendPlaybackStatus, 5000);
}

function sendPlaybackStatus() {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    let status = 'paused';
    if (currentSource === 'youtube' && ytPlayer && ytReady) {
        const state = ytPlayer.getPlayerState();
        if (state === YT.PlayerState.PLAYING) status = 'playing';
        else if (state === YT.PlayerState.BUFFERING) status = 'buffering';
        else status = 'paused';
    } else if (currentSource === 'vimeo') {
        status = vimeoIsPlaying ? 'playing' : 'paused';
    } else if (currentSource === 'twitch' && twitchPlayer) {
        status = twitchPlayer.isPaused() ? 'paused' : 'playing';
    } else if (currentSource === 'dailymotion' && dmPlayer) {
        status = dmPlayer.paused ? 'paused' : 'playing';
    } else if (currentSource === 'file') {
        const v = document.getElementById('videoPlayer');
        if (v.readyState < 3 && !v.paused) status = 'buffering';
        else status = v.paused ? 'paused' : 'playing';
    }

    if (status !== lastStatusSent) {
        lastStatusSent = status;
        ws.send(JSON.stringify({
            type: 'status',
            content: status,
            userID: myUserId
        }));
    }
}

// ============================================
// BUFFERING SYNC
// ============================================

function sendBuffering(isBuffering) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({
        type: isBuffering ? 'buffering' : 'bufferend',
        userID: myUserId
    }));
}

function pauseForBuffering() {
    // Save current playing state then pause
    if (currentSource === 'youtube' && ytPlayer && ytReady) {
        wasPlayingBeforeBuffer = ytPlayer.getPlayerState() === YT.PlayerState.PLAYING;
        ytIgnoreStateChange = true;
        ytPlayer.pauseVideo();
        setTimeout(() => { ytIgnoreStateChange = false; }, 500);
    } else if (currentSource === 'vimeo' && vimeoPlayer) {
        wasPlayingBeforeBuffer = vimeoIsPlaying;
        vimeoIgnoreEvents = true;
        vimeoPlayer.pause();
        setTimeout(() => { vimeoIgnoreEvents = false; }, 500);
    } else if (currentSource === 'file') {
        const v = document.getElementById('videoPlayer');
        wasPlayingBeforeBuffer = !v.paused;
        isLocalAction = false;
        v.pause();
    }
}

function resumeAfterBuffering() {
    if (!wasPlayingBeforeBuffer) return;
    if (currentSource === 'youtube' && ytPlayer && ytReady) {
        ytIgnoreStateChange = true;
        ytPlayer.playVideo();
        setTimeout(() => { ytIgnoreStateChange = false; }, 500);
    } else if (currentSource === 'vimeo' && vimeoPlayer) {
        vimeoIgnoreEvents = true;
        vimeoPlayer.play();
        setTimeout(() => { vimeoIgnoreEvents = false; }, 500);
    } else if (currentSource === 'file') {
        const v = document.getElementById('videoPlayer');
        isLocalAction = false;
        v.play().catch(() => {});
    }
}

// ============================================
// HOST/VIEWER ROLES
// ============================================

function updateHostUI() {
    const btn = document.getElementById('hostModeBtn');

    // Show host button to everyone in the room
    if (roomUsers.length > 0) {
        btn.style.display = '';
    }

    // Room creator defaults to host
    if (isRoomCreator && !hostUserId) {
        hostUserId = myUserId;
        isHost = true;
    }

    isHost = (myUserId === hostUserId);

    if (hostMode) {
        btn.innerHTML = '<span>👑</span> Host Mode: On';
        btn.classList.add('active');
    } else {
        btn.innerHTML = '<span>👑</span> Host Mode: Off';
        btn.classList.remove('active');
    }

    // Re-render user list with crowns
    if (roomUsers.length > 0) updateUserList(roomUsers);
}

function toggleHostMode() {
    if (!isHost) {
        alert('Only the host can toggle host mode');
        return;
    }

    hostMode = !hostMode;

    if (ws && ws.readyState === WebSocket.OPEN) {
        if (hostMode) {
            ws.send(JSON.stringify({ type: 'hostchange', userID: myUserId }));
        } else {
            ws.send(JSON.stringify({ type: 'hostmodeoff' }));
        }
    }

    updateHostUI();
}

function transferHost(newHostId) {
    if (!isHost) return;
    hostUserId = newHostId;
    isHost = false;
    hostMode = true;

    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'hostchange', userID: newHostId }));
    }

    updateHostUI();
}

// ============================================
// YOUTUBE VOLUME & SPEED CONTROLS
// ============================================

function showYTControls() {
    document.getElementById('ytControlsGroup').style.display = 'flex';
}

function hideYTControls() {
    document.getElementById('ytControlsGroup').style.display = 'none';
}

// Called directly from HTML oninput/onchange
function onYtVolumeChange(val) {
    val = parseInt(val);
    console.log('YT Volume:', val, 'player ready:', ytReady);
    if (ytPlayer && ytReady) {
        if (val === 0) {
            ytPlayer.mute();
        } else {
            ytPlayer.unMute();
            ytPlayer.setVolume(val);
        }
    }
}

function onYtSpeedChange(val) {
    val = parseFloat(val);
    console.log('YT Speed:', val, 'player ready:', ytReady);
    if (ytPlayer && ytReady) {
        ytPlayer.setPlaybackRate(val);
    }
}

// ============================================
// CUSTOM FULLSCREEN (uses real Fullscreen API)
// ============================================

function isFullscreen() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement);
}

function toggleCustomFullscreen() {
    const wrapper = document.getElementById('videoWrapper');

    if (!isFullscreen()) {
        const rfs = wrapper.requestFullscreen || wrapper.webkitRequestFullscreen;
        if (rfs) {
            rfs.call(wrapper).catch(() => {
                // Fallback to CSS-only fullscreen if API fails
                wrapper.classList.add('custom-fullscreen');
            });
        } else {
            wrapper.classList.add('custom-fullscreen');
        }
    } else {
        const efs = document.exitFullscreen || document.webkitExitFullscreen;
        if (efs) {
            efs.call(document).catch(() => {
                wrapper.classList.remove('custom-fullscreen');
            });
        } else {
            wrapper.classList.remove('custom-fullscreen');
        }
    }
}

// Sync UI when fullscreen state changes (including ESC key)
document.addEventListener('fullscreenchange', onFullscreenChange);
document.addEventListener('webkitfullscreenchange', onFullscreenChange);

function onFullscreenChange() {
    const wrapper = document.getElementById('videoWrapper');
    const btn = document.getElementById('ytFullscreenBtn');
    if (isFullscreen()) {
        wrapper.classList.add('custom-fullscreen');
        btn.textContent = '✕ Exit Fullscreen';
    } else {
        wrapper.classList.remove('custom-fullscreen');
        btn.textContent = '⛶ Theater Fullscreen';
    }
}

// ============================================
// INITIALIZATION
// ============================================

// Set random theater name on load
document.getElementById('userName').value = generateName();

// URL hint listener
document.getElementById('videoUrlInput').addEventListener('input', updateUrlHint);

// Chat input enter key
document.getElementById('chatInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendChat();
});

// Check for room in URL and auto-join
const urlParams = new URLSearchParams(window.location.search);
const roomFromUrl = urlParams.get('room');

if (roomFromUrl) {
    document.getElementById('roomCodeInput').value = roomFromUrl;

    const roomInput = document.getElementById('roomCodeInput');
    roomInput.focus();

    document.getElementById('userName').addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && roomFromUrl) {
            joinRoom();
        }
    });

    setTimeout(() => {
        document.getElementById('roomCodeInput').scrollIntoView({
            behavior: 'smooth',
            block: 'center'
        });
    }, 100);
} else {
    // Check for rejoin
    checkRejoin();
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

// Allow Enter key in URL input
document.getElementById('videoUrlInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        onLoadUrlClick();
    }
});

console.log('Co-op Cinema initialized');
console.log('Your ID:', myUserId);
