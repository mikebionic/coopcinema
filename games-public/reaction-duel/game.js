// ============================================
// REACTION DUEL - Game Logic
// ============================================

(function () {
    'use strict';

    var TOTAL_ROUNDS = 3;
    var MIN_DELAY = 2000;  // ms before green
    var MAX_DELAY = 5000;

    // Per-player scores: { id: { name, wins, bestTime, currentTime } }
    var scores = {};
    var currentRound = 0;
    var roundActive = false;
    var goTime = 0;           // timestamp when green appeared
    var tapped = false;
    var delayTimeout = null;
    var roundResults = {};    // { id: time_ms | 'early' }
    var allReadyForNext = {}; // { id: true } - who acked round result

    // Init
    var nameParam = GameBase.getParam('name');
    if (nameParam) document.getElementById('playerName').value = nameParam;
    else document.getElementById('playerName').value = GameBase.generateName();

    var roomParam = GameBase.getParam('room');
    if (roomParam) {
        document.getElementById('roomInput').value = roomParam;
    }

    // --- Lobby Actions ---

    window.onCreateRoom = async function () {
        if (!setName()) return;
        await GameBase.createRoom();
        startWaiting();
    };

    window.onJoinRoom = function () {
        if (!setName()) return;
        var code = document.getElementById('roomInput').value.trim();
        if (!code) { alert('Enter a room code'); return; }
        GameBase.joinRoom(code);
        startWaiting();
    };

    function setName() {
        var name = document.getElementById('playerName').value.trim();
        if (!name) { alert('Enter your name'); return false; }
        GameBase.myName = name;
        return true;
    }

    function startWaiting() {
        document.getElementById('displayCode').textContent = GameBase.roomCode;
        GameBase.showScreen('screenWaiting');
        GameBase.connect();
    }

    window.copyCode = function () {
        navigator.clipboard.writeText(GameBase.roomCode).then(function () {
            GameBase.toast('Room code copied!');
        });
    };

    // --- Player Updates ---

    GameBase.on('playerUpdate', function (data) {
        GameBase.renderPlayers(document.getElementById('playerList'));
        var count = GameBase.getPlayerCount();
        var hint = document.getElementById('waitingHint');
        var btn = document.getElementById('btnReady');

        if (count >= 2) {
            hint.textContent = count + ' players connected';
            btn.disabled = false;
        } else {
            hint.textContent = 'Need at least 2 players to start';
            btn.disabled = true;
        }

        // Init scores for new players
        Object.keys(data.players).forEach(function (id) {
            if (!scores[id]) {
                scores[id] = { name: data.players[id].name, wins: 0, bestTime: Infinity, currentTime: null };
            }
        });
    });

    // --- Ready System ---

    window.onReady = function () {
        GameBase.send('game:ready', {});
        document.getElementById('btnReady').disabled = true;
        document.getElementById('btnReady').textContent = 'Waiting for others...';
    };

    GameBase.on('game:ready', function () {
        updateReadyStatus();
    });

    GameBase.on('playerUpdate', function () {
        updateReadyStatus();
    });

    function updateReadyStatus() {
        var players = GameBase.players;
        var ids = Object.keys(players);
        var readyCount = ids.filter(function (id) { return players[id].ready; }).length;
        var total = ids.length;

        document.getElementById('readyStatus').textContent = readyCount + '/' + total + ' ready';

        // Host starts game when all ready and >= 2 players
        if (GameBase.isHost() && readyCount === total && total >= 2) {
            setTimeout(function () {
                GameBase.send('reaction:start', { round: 1 });
            }, 500);
        }
    }

    // --- Game Start ---

    GameBase.on('reaction:start', function (data) {
        currentRound = data.payload.round || 1;
        roundResults = {};
        tapped = false;
        roundActive = false;
        goTime = 0;

        document.getElementById('roundInfo').textContent = 'Round ' + currentRound + ' of ' + TOTAL_ROUNDS;
        document.getElementById('reactionResult').textContent = '';
        GameBase.showScreen('screenGame');

        setZoneState('waiting', 'WAIT...');

        // Determine random delay — host sends the go signal after delay
        if (GameBase.isHost()) {
            var delay = MIN_DELAY + Math.random() * (MAX_DELAY - MIN_DELAY);
            delayTimeout = setTimeout(function () {
                GameBase.send('reaction:go', { ts: Date.now() });
            }, delay);
        }
    });

    // --- GO Signal ---

    GameBase.on('reaction:go', function () {
        goTime = performance.now();
        roundActive = true;
        setZoneState('go', 'TAP NOW!');
    });

    // --- Player Tap ---

    window.onTap = function () {
        if (tapped) return;

        if (!roundActive && goTime === 0) {
            // Tapped too early!
            tapped = true;
            clearTimeout(delayTimeout);
            setZoneState('early', 'TOO EARLY!');
            GameBase.send('reaction:early', { round: currentRound });
            document.getElementById('reactionResult').textContent = 'You jumped the gun! Automatic loss this round.';
            return;
        }

        if (!roundActive) return;

        tapped = true;
        var elapsed = performance.now() - goTime;
        var ms = Math.round(elapsed);

        setZoneState('result', ms + ' ms');
        document.getElementById('reactionResult').innerHTML = '<span class="time-display ' + (ms < 300 ? 'fast' : 'slow') + '">' + ms + ' ms</span>';

        GameBase.send('reaction:click', { time: ms, round: currentRound });
    };

    // --- Receive Results ---

    GameBase.on('reaction:click', function (data) {
        roundResults[data.senderId] = data.payload.time;
        checkRoundComplete();
    });

    GameBase.on('reaction:early', function (data) {
        roundResults[data.senderId] = 'early';
        checkRoundComplete();
    });

    function checkRoundComplete() {
        var players = GameBase.players;
        var ids = Object.keys(players);
        var allIn = ids.every(function (id) { return roundResults[id] !== undefined; });

        if (!allIn) return;

        // Determine round winner
        var bestId = null;
        var bestTime = Infinity;

        ids.forEach(function (id) {
            var t = roundResults[id];
            if (t !== 'early' && t < bestTime) {
                bestTime = t;
                bestId = id;
            }
        });

        if (bestId) {
            scores[bestId].wins++;
            if (bestTime < scores[bestId].bestTime) scores[bestId].bestTime = bestTime;
        }

        // Show round result
        var resultText = '';
        if (bestId) {
            var winnerName = (scores[bestId] || {}).name || 'Unknown';
            resultText = '🏆 ' + winnerName + ' wins round ' + currentRound + ' (' + bestTime + ' ms)';
        } else {
            resultText = 'Everyone was too early! No winner this round.';
        }

        document.getElementById('reactionResult').innerHTML = resultText +
            '<br><small style="color:var(--text-secondary);">Next round starting soon...</small>';

        roundActive = false;

        // Host triggers next round or final scoreboard
        if (GameBase.isHost()) {
            setTimeout(function () {
                if (currentRound >= TOTAL_ROUNDS) {
                    GameBase.send('reaction:result', { scores: scores });
                } else {
                    GameBase.send('reaction:start', { round: currentRound + 1 });
                }
            }, 2500);
        }
    }

    // --- Final Scoreboard ---

    GameBase.on('reaction:result', function (data) {
        // Merge authoritative scores from host
        var hostScores = data.payload.scores || scores;
        Object.keys(hostScores).forEach(function (id) {
            scores[id] = hostScores[id];
        });

        showScoreboard();
    });

    function showScoreboard() {
        GameBase.showScreen('screenScoreboard');
        var tbody = document.getElementById('scoreBody');
        tbody.innerHTML = '';

        var sorted = Object.keys(scores).sort(function (a, b) {
            return (scores[b].wins - scores[a].wins) || (scores[a].bestTime - scores[b].bestTime);
        });

        var maxWins = scores[sorted[0]] ? scores[sorted[0]].wins : 0;

        sorted.forEach(function (id) {
            var s = scores[id];
            var tr = document.createElement('tr');
            if (s.wins === maxWins && maxWins > 0) tr.className = 'winner';
            tr.innerHTML =
                '<td>' + GameBase.escapeHtml(s.name) + (id === GameBase.myId ? ' (You)' : '') + '</td>' +
                '<td>' + s.wins + '/' + TOTAL_ROUNDS + '</td>' +
                '<td>' + (s.bestTime === Infinity ? '-' : s.bestTime + ' ms') + '</td>';
            tbody.appendChild(tr);
        });
    }

    // --- Play Again ---

    window.onPlayAgain = function () {
        // Reset scores
        Object.keys(scores).forEach(function (id) {
            scores[id].wins = 0;
            scores[id].bestTime = Infinity;
            scores[id].currentTime = null;
        });
        currentRound = 0;
        roundActive = false;
        tapped = false;
        roundResults = {};

        // Reset ready states on players
        var players = GameBase.players;
        Object.keys(players).forEach(function (id) {
            players[id].ready = false;
        });

        document.getElementById('btnReady').disabled = false;
        document.getElementById('btnReady').innerHTML = '<span>✋</span> Ready!';
        document.getElementById('readyStatus').textContent = '';
        GameBase.showScreen('screenWaiting');
    };

    // --- UI Helpers ---

    function setZoneState(state, text) {
        var zone = document.getElementById('reactionZone');
        zone.className = 'reaction-zone state-' + state;
        var textEl = document.getElementById('zoneText');
        textEl.textContent = text;
        textEl.className = 'zone-text' + (state === 'result' ? '' : '');
    }

})();
