// ============================================
// GAME BASE - Shared WS Connection & Utilities
// ============================================

const GameBase = (function () {
    let ws = null;
    let roomCode = null;
    let myId = generateId();
    let myName = '';
    let players = {};        // { id: { name, ready } }
    let handlers = {};       // { type: [fn, ...] }
    let reconnectTimer = null;
    let pingInterval = null;

    function generateId() {
        return Math.random().toString(36).substr(2, 9);
    }

    function generateName() {
        const adj = ['Stellar', 'Cosmic', 'Velvet', 'Golden', 'Crimson', 'Azure', 'Emerald', 'Neon', 'Starlight', 'Electric'];
        const noun = ['Player', 'Gamer', 'Champion', 'Hero', 'Star', 'Ace', 'Wizard', 'Knight', 'Phoenix', 'Legend'];
        return adj[Math.floor(Math.random() * adj.length)] + ' ' + noun[Math.floor(Math.random() * noun.length)];
    }

    // Determine host: lowest id among connected players
    function getHostId() {
        const ids = Object.keys(players);
        if (ids.length === 0) return myId;
        return ids.sort()[0];
    }

    function isHost() {
        return getHostId() === myId;
    }

    // WebSocket URL
    function wsUrl() {
        const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
        return `${proto}//${location.host}/ws?room=${roomCode}`;
    }

    // Create a new room via /generate-room endpoint
    async function createRoom() {
        const resp = await fetch('/generate-room');
        const data = await resp.json();
        roomCode = data.code;
        return roomCode;
    }

    // Join an existing room
    function joinRoom(code) {
        roomCode = code.trim().toLowerCase();
        return roomCode;
    }

    // Connect WebSocket
    function connect(onOpen) {
        if (ws) ws.close();

        ws = new WebSocket(wsUrl());

        ws.onopen = function () {
            clearTimeout(reconnectTimer);
            // Announce ourselves
            send('game:join', { name: myName });
            // Heartbeat
            pingInterval = setInterval(function () {
                if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type: 'ping' }));
                }
            }, 30000);
            if (onOpen) onOpen();
        };

        ws.onmessage = function (evt) {
            let msg;
            try {
                msg = JSON.parse(evt.data);
            } catch (e) {
                return;
            }

            // The relay sends: { type, userId, userName, content, timestamp }
            // Game messages pack game-type inside content as JSON
            const senderId = msg.userId || '';
            const senderName = msg.userName || '';

            // Try parsing content as game message
            let gameMsg;
            try {
                gameMsg = JSON.parse(msg.content || '{}');
            } catch (e) {
                gameMsg = {};
            }

            const gameType = gameMsg.gameType || '';
            const payload = gameMsg.payload || {};

            // Handle built-in game:join / game:leave
            if (gameType === 'game:join') {
                players[senderId] = { name: payload.name || senderName || 'Anon', ready: false };
                fire('playerUpdate', { players: { ...players }, hostId: getHostId() });
            } else if (gameType === 'game:leave') {
                delete players[senderId];
                fire('playerUpdate', { players: { ...players }, hostId: getHostId() });
            } else if (gameType === 'game:ready') {
                if (players[senderId]) players[senderId].ready = true;
                fire('playerUpdate', { players: { ...players }, hostId: getHostId() });
            } else if (gameType) {
                // Fire specific game handler
                fire(gameType, { senderId, senderName, payload });
            }
        };

        ws.onclose = function () {
            clearInterval(pingInterval);
            reconnectTimer = setTimeout(function () {
                connect(onOpen);
            }, 2000);
        };

        ws.onerror = function () {
            ws.close();
        };
    }

    // Send game message via the relay
    function send(gameType, payload) {
        if (!ws || ws.readyState !== WebSocket.OPEN) return;
        ws.send(JSON.stringify({
            type: 'chat',
            userId: myId,
            userName: myName,
            content: JSON.stringify({ gameType, payload: payload || {} }),
            room: roomCode
        }));
    }

    // Event system
    function on(type, fn) {
        if (!handlers[type]) handlers[type] = [];
        handlers[type].push(fn);
    }

    function off(type, fn) {
        if (!handlers[type]) return;
        handlers[type] = handlers[type].filter(function (f) { return f !== fn; });
    }

    function fire(type, data) {
        (handlers[type] || []).forEach(function (fn) { fn(data); });
    }

    // Timer utility
    function startTimer(seconds, onTick, onDone) {
        let remaining = seconds;
        onTick(remaining);
        const interval = setInterval(function () {
            remaining--;
            onTick(remaining);
            if (remaining <= 0) {
                clearInterval(interval);
                if (onDone) onDone();
            }
        }, 1000);
        return {
            stop: function () { clearInterval(interval); },
            getRemaining: function () { return remaining; }
        };
    }

    // Toast notification
    function toast(msg, duration) {
        duration = duration || 2000;
        let el = document.getElementById('gameToast');
        if (!el) {
            el = document.createElement('div');
            el.id = 'gameToast';
            el.className = 'toast';
            document.body.appendChild(el);
        }
        el.textContent = msg;
        el.classList.add('show');
        setTimeout(function () { el.classList.remove('show'); }, duration);
    }

    // Show/hide screens
    function showScreen(id) {
        document.querySelectorAll('.game-screen').forEach(function (s) {
            s.classList.remove('active');
        });
        const el = document.getElementById(id);
        if (el) el.classList.add('active');
    }

    // Parse URL params
    function getParam(name) {
        return new URLSearchParams(location.search).get(name);
    }

    // Render player list into a UL element
    function renderPlayers(ulElement) {
        ulElement.innerHTML = '';
        const hostId = getHostId();
        Object.keys(players).sort().forEach(function (id) {
            const p = players[id];
            const li = document.createElement('li');
            let html = '<span>' + escapeHtml(p.name) + '</span>';
            if (id === myId) html += ' <span class="player-badge">You</span>';
            if (id === hostId) html += ' <span class="player-badge host">Host</span>';
            if (p.ready) html += ' <span class="player-badge ready" style="background:rgba(74,222,128,0.2);color:#4ade80;">Ready</span>';
            li.innerHTML = html;
            ulElement.appendChild(li);
        });
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function getPlayerCount() {
        return Object.keys(players).length;
    }

    function getPlayers() {
        return { ...players };
    }

    function disconnect() {
        if (ws) {
            send('game:leave', {});
            ws.close();
            ws = null;
        }
        players = {};
        clearInterval(pingInterval);
        clearTimeout(reconnectTimer);
    }

    return {
        get myId() { return myId; },
        get myName() { return myName; },
        set myName(n) { myName = n; },
        get roomCode() { return roomCode; },
        get players() { return getPlayers(); },
        generateName: generateName,
        createRoom: createRoom,
        joinRoom: joinRoom,
        connect: connect,
        disconnect: disconnect,
        send: send,
        on: on,
        off: off,
        isHost: isHost,
        getHostId: getHostId,
        getPlayerCount: getPlayerCount,
        renderPlayers: renderPlayers,
        startTimer: startTimer,
        showScreen: showScreen,
        getParam: getParam,
        toast: toast,
        escapeHtml: escapeHtml
    };
})();
