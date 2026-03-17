// ============================================
// SPLIT OR STEAL - Game Logic
// ============================================

(function () {
    'use strict';

    var DISCUSS_TIME = 30;
    var STAKES = [500, 750, 1000, 1500, 2000, 3000, 5000];

    var currentStakes = 0;
    var myChoice = null;        // 'split' | 'steal'
    var opponentChoice = null;
    var opponentId = null;
    var opponentName = '';
    var choices = {};           // { id: 'split' | 'steal' }
    var chosenPlayers = {};     // { id: true } — who has locked in
    var timer = null;
    var playerIds = [];

    // Init
    var nameParam = GameBase.getParam('name');
    if (nameParam) document.getElementById('playerName').value = nameParam;
    else document.getElementById('playerName').value = GameBase.generateName();

    var roomParam = GameBase.getParam('room');
    if (roomParam) document.getElementById('roomInput').value = roomParam;

    // Enter key for chat
    document.getElementById('chatInput').addEventListener('keydown', function (e) {
        if (e.key === 'Enter') sendChat();
    });

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

        if (count === 2) {
            hint.textContent = '2 players connected — ready to play!';
            btn.disabled = false;
        } else if (count > 2) {
            hint.textContent = 'This game is for exactly 2 players (' + count + ' connected)';
            btn.disabled = true;
        } else {
            hint.textContent = 'Need exactly 2 players';
            btn.disabled = true;
        }
    });

    // --- Ready System ---

    window.onReady = function () {
        GameBase.send('game:ready', {});
        document.getElementById('btnReady').disabled = true;
        document.getElementById('btnReady').textContent = 'Waiting for opponent...';
    };

    function updateReadyStatus() {
        var players = GameBase.players;
        var ids = Object.keys(players);
        var readyCount = ids.filter(function (id) { return players[id].ready; }).length;
        var total = ids.length;

        document.getElementById('readyStatus').textContent = readyCount + '/' + total + ' ready';

        if (GameBase.isHost() && readyCount === total && total === 2) {
            var stakes = STAKES[Math.floor(Math.random() * STAKES.length)];
            setTimeout(function () {
                GameBase.send('sos:start', { stakes: stakes });
            }, 500);
        }
    }

    GameBase.on('game:ready', updateReadyStatus);
    GameBase.on('playerUpdate', updateReadyStatus);

    // --- Game Start: Stakes Reveal ---

    GameBase.on('sos:start', function (data) {
        currentStakes = data.payload.stakes;
        myChoice = null;
        opponentChoice = null;
        choices = {};
        chosenPlayers = {};

        // Figure out opponent
        playerIds = Object.keys(GameBase.players).sort();
        opponentId = playerIds.find(function (id) { return id !== GameBase.myId; });
        opponentName = opponentId ? (GameBase.players[opponentId] || {}).name || 'Opponent' : 'Opponent';

        document.getElementById('stakesAmount').textContent = currentStakes;
        GameBase.showScreen('screenStakes');

        // Host triggers discussion phase after a delay
        if (GameBase.isHost()) {
            setTimeout(function () {
                GameBase.send('sos:discuss-start', {});
            }, 3500);
        }
    });

    // --- Discussion Phase ---

    GameBase.on('sos:discuss-start', function () {
        document.getElementById('chatBox').innerHTML = '';
        GameBase.showScreen('screenDiscuss');
        document.getElementById('chatInput').focus();

        if (timer) timer.stop();
        timer = GameBase.startTimer(DISCUSS_TIME, function (sec) {
            var el = document.getElementById('discussTimer');
            el.textContent = sec;
            el.className = 'timer-display' + (sec <= 5 ? ' urgent' : '');
        }, function () {
            // Discussion over, host triggers choice phase
            if (GameBase.isHost()) {
                GameBase.send('sos:discuss-end', {});
            }
        });
    });

    // Chat
    window.sendChat = function () {
        var input = document.getElementById('chatInput');
        var text = input.value.trim();
        if (!text) return;
        input.value = '';
        GameBase.send('sos:chat', { text: text });
    };

    GameBase.on('sos:chat', function (data) {
        var box = document.getElementById('chatBox');
        var name = data.senderId === GameBase.myId ? 'You' :
            ((GameBase.players[data.senderId] || {}).name || data.senderName || 'Anon');
        var div = document.createElement('div');
        div.className = 'chat-msg';
        div.innerHTML = '<span class="chat-author">' + GameBase.escapeHtml(name) + ':</span> <span class="chat-text">' + GameBase.escapeHtml(data.payload.text) + '</span>';
        box.appendChild(div);
        box.scrollTop = box.scrollHeight;
    });

    // --- Choice Phase ---

    GameBase.on('sos:discuss-end', function () {
        if (timer) timer.stop();
        myChoice = null;
        document.getElementById('choiceButtons').style.display = 'grid';
        document.getElementById('choiceWaiting').style.display = 'none';
        GameBase.showScreen('screenChoice');
    });

    window.makeChoice = function (choice) {
        myChoice = choice;
        choices[GameBase.myId] = choice;
        document.getElementById('choiceButtons').style.display = 'none';
        document.getElementById('choiceWaiting').style.display = 'block';

        // Send "chosen" signal (no data — opponent just knows we've locked in)
        GameBase.send('sos:chosen', {});
    };

    GameBase.on('sos:chosen', function (data) {
        chosenPlayers[data.senderId] = true;

        if (data.senderId !== GameBase.myId) {
            document.getElementById('opponentStatus').textContent = 'Opponent has chosen!';
        }

        // When both have chosen, trigger reveal
        if (Object.keys(chosenPlayers).length >= 2 && myChoice) {
            setTimeout(function () {
                // Each player reveals their own choice
                GameBase.send('sos:reveal', { choice: myChoice });
            }, 500);
        }
    });

    // --- Dramatic Reveal ---

    var reveals = {};

    GameBase.on('sos:reveal', function (data) {
        reveals[data.senderId] = data.payload.choice;

        // Wait for both reveals
        if (Object.keys(reveals).length < 2) return;

        // Show reveal screen
        var sorted = playerIds.slice().sort();
        var p1 = sorted[0], p2 = sorted[1];
        var name1 = (GameBase.players[p1] || {}).name || 'Player 1';
        var name2 = (GameBase.players[p2] || {}).name || 'Player 2';

        document.getElementById('revealName1').textContent = name1 + (p1 === GameBase.myId ? ' (You)' : '');
        document.getElementById('revealName2').textContent = name2 + (p2 === GameBase.myId ? ' (You)' : '');

        setupCardBack('cardBack1', reveals[p1]);
        setupCardBack('cardBack2', reveals[p2]);

        GameBase.showScreen('screenReveal');

        // Flip cards with delay
        setTimeout(function () {
            document.querySelector('#revealCard1 .card-inner').classList.add('flipped');
        }, 1000);

        setTimeout(function () {
            document.querySelector('#revealCard2 .card-inner').classList.add('flipped');
        }, 2000);

        // Show result after both flip
        setTimeout(function () {
            showResult(p1, reveals[p1], name1, p2, reveals[p2], name2);
        }, 3500);
    });

    function setupCardBack(elementId, choice) {
        var el = document.getElementById(elementId);
        el.className = 'card-back ' + (choice === 'split' ? 'split-back' : 'steal-back');
        el.innerHTML = '<span class="card-choice-icon">' + (choice === 'split' ? '🤝' : '😈') + '</span>' +
            '<span class="card-choice-text">' + choice.toUpperCase() + '</span>';
    }

    function showResult(p1, c1, name1, p2, c2, name2) {
        var pts1 = 0, pts2 = 0;
        var icon, title, detail;

        if (c1 === 'split' && c2 === 'split') {
            pts1 = pts2 = Math.floor(currentStakes / 2);
            icon = '🎉';
            title = 'Both Split!';
            detail = 'Trust wins! You each get ' + pts1 + ' points.';
            // Confetti!
            launchConfetti();
        } else if (c1 === 'steal' && c2 === 'steal') {
            pts1 = pts2 = 0;
            icon = '💀';
            title = 'Both Stole!';
            detail = 'Greed destroys everything. Nobody gets anything.';
        } else {
            var stealerId = c1 === 'steal' ? p1 : p2;
            var stealerName = c1 === 'steal' ? name1 : name2;
            if (c1 === 'steal') { pts1 = currentStakes; pts2 = 0; }
            else { pts1 = 0; pts2 = currentStakes; }
            icon = '😈';
            title = stealerName + ' Stole!';
            detail = 'Betrayal! The stealer takes all ' + currentStakes + ' points.';
        }

        // Show reveal result text
        var revealResult = document.getElementById('revealResult');
        revealResult.style.display = 'block';
        revealResult.textContent = title;

        // Transition to result screen
        setTimeout(function () {
            document.getElementById('resultIcon').textContent = icon;
            document.getElementById('resultTitle').textContent = title;
            document.getElementById('resultDetail').textContent = detail;

            var breakdown = document.getElementById('resultBreakdown');
            breakdown.innerHTML = '';

            [[p1, name1, c1, pts1], [p2, name2, c2, pts2]].forEach(function (arr) {
                var id = arr[0], name = arr[1], choice = arr[2], pts = arr[3];
                var div = document.createElement('div');
                div.className = 'result-player';
                div.innerHTML =
                    '<div class="rp-name">' + GameBase.escapeHtml(name) + (id === GameBase.myId ? ' (You)' : '') + '</div>' +
                    '<div class="rp-choice">' + (choice === 'split' ? '🤝' : '😈') + '</div>' +
                    '<div class="rp-points ' + (pts > 0 ? 'won' : 'lost') + '">+' + pts + ' pts</div>';
                breakdown.appendChild(div);
            });

            GameBase.showScreen('screenResult');
        }, 2000);
    }

    // --- Play Again ---

    window.onPlayAgain = function () {
        myChoice = null;
        opponentChoice = null;
        choices = {};
        chosenPlayers = {};
        reveals = {};
        if (timer) timer.stop();

        // Reset card flips
        document.querySelectorAll('.card-inner').forEach(function (el) {
            el.classList.remove('flipped');
        });

        var players = GameBase.players;
        Object.keys(players).forEach(function (id) {
            players[id].ready = false;
        });

        document.getElementById('btnReady').disabled = false;
        document.getElementById('btnReady').innerHTML = '<span>✋</span> Ready!';
        document.getElementById('readyStatus').textContent = '';
        GameBase.showScreen('screenWaiting');
    };

    // --- Confetti ---

    function launchConfetti() {
        var canvas = document.getElementById('confettiCanvas');
        if (!canvas) return;
        var ctx = canvas.getContext('2d');
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;

        var particles = [];
        var colors = ['#ffa500', '#ffd700', '#ff6347', '#4ade80', '#60a5fa', '#c084fc', '#f472b6'];

        for (var i = 0; i < 150; i++) {
            particles.push({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height - canvas.height,
                w: Math.random() * 10 + 5,
                h: Math.random() * 6 + 3,
                color: colors[Math.floor(Math.random() * colors.length)],
                vx: (Math.random() - 0.5) * 4,
                vy: Math.random() * 3 + 2,
                rot: Math.random() * 360,
                rotSpeed: (Math.random() - 0.5) * 10
            });
        }

        var frames = 0;
        function draw() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            particles.forEach(function (p) {
                ctx.save();
                ctx.translate(p.x, p.y);
                ctx.rotate(p.rot * Math.PI / 180);
                ctx.fillStyle = p.color;
                ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
                ctx.restore();

                p.x += p.vx;
                p.y += p.vy;
                p.rot += p.rotSpeed;
                p.vy += 0.05;
            });

            frames++;
            if (frames < 180) {
                requestAnimationFrame(draw);
            } else {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
            }
        }

        draw();
    }

})();
