// ============================================
// EMOJI DECODE - Game Logic
// ============================================

(function () {
    'use strict';

    var TOTAL_ROUNDS = 5;
    var ROUND_TIME = 30;    // seconds
    var HINT_TIME = 15;     // show hint after this many seconds

    // Scoring
    var POINTS_CORRECT = 100;
    var POINTS_SPEED_BONUS = 50;   // if answered in first 10 seconds
    var POINTS_PRE_HINT = 25;      // bonus if answered before hint

    var scores = {};         // { id: { name, score, correct } }
    var currentRound = 0;
    var currentPuzzle = null;
    var usedPuzzles = [];
    var timer = null;
    var roundSolved = false; // has anyone solved this round
    var mySolved = false;    // have I solved this round
    var hintShown = false;
    var roundStartTime = 0;

    // Init
    var nameParam = GameBase.getParam('name');
    if (nameParam) document.getElementById('playerName').value = nameParam;
    else document.getElementById('playerName').value = GameBase.generateName();

    var roomParam = GameBase.getParam('room');
    if (roomParam) document.getElementById('roomInput').value = roomParam;

    // Enter key on guess input
    document.getElementById('guessInput').addEventListener('keydown', function (e) {
        if (e.key === 'Enter') submitGuess();
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

        if (count >= 2) {
            hint.textContent = count + ' players connected';
            btn.disabled = false;
        } else {
            hint.textContent = 'Need at least 2 players to start';
            btn.disabled = true;
        }

        Object.keys(data.players).forEach(function (id) {
            if (!scores[id]) {
                scores[id] = { name: data.players[id].name, score: 0, correct: 0 };
            }
        });
    });

    // --- Ready System ---

    window.onReady = function () {
        GameBase.send('game:ready', {});
        document.getElementById('btnReady').disabled = true;
        document.getElementById('btnReady').textContent = 'Waiting for others...';
    };

    function updateReadyStatus() {
        var players = GameBase.players;
        var ids = Object.keys(players);
        var readyCount = ids.filter(function (id) { return players[id].ready; }).length;
        var total = ids.length;

        document.getElementById('readyStatus').textContent = readyCount + '/' + total + ' ready';

        if (GameBase.isHost() && readyCount === total && total >= 2) {
            usedPuzzles = [];
            setTimeout(function () {
                startNextRound(1);
            }, 500);
        }
    }

    GameBase.on('game:ready', updateReadyStatus);
    GameBase.on('playerUpdate', updateReadyStatus);

    // --- Round Management (host-driven) ---

    function startNextRound(roundNum) {
        var puzzle = pickPuzzle();
        if (!puzzle) return; // shouldn't happen with 45 puzzles and 5 rounds

        GameBase.send('emoji:start', {
            round: roundNum,
            emoji: puzzle.emoji,
            answer: puzzle.answer,
            hint: puzzle.hint,
            category: puzzle.category
        });
    }

    function pickPuzzle() {
        var available = PUZZLES.filter(function (p) {
            return usedPuzzles.indexOf(p.answer) === -1;
        });
        if (available.length === 0) return null;
        var pick = available[Math.floor(Math.random() * available.length)];
        usedPuzzles.push(pick.answer);
        return pick;
    }

    // --- Round Start ---

    GameBase.on('emoji:start', function (data) {
        currentRound = data.payload.round;
        currentPuzzle = {
            emoji: data.payload.emoji,
            answer: data.payload.answer,
            hint: data.payload.hint,
            category: data.payload.category
        };
        roundSolved = false;
        mySolved = false;
        hintShown = false;
        roundStartTime = Date.now();

        document.getElementById('roundInfo').textContent = 'Round ' + currentRound + '/' + TOTAL_ROUNDS;
        document.getElementById('categoryBadge').textContent = currentPuzzle.category;
        document.getElementById('emojiDisplay').textContent = currentPuzzle.emoji;
        document.getElementById('hintBox').style.display = 'none';
        document.getElementById('guessInput').value = '';
        document.getElementById('guessInput').disabled = false;
        document.getElementById('guessFeedback').textContent = '';
        document.getElementById('guessFeedback').className = 'guess-feedback';
        document.getElementById('guessLog').innerHTML = '';

        GameBase.showScreen('screenRound');
        document.getElementById('guessInput').focus();

        // Start timer
        if (timer) timer.stop();
        timer = GameBase.startTimer(ROUND_TIME, function (sec) {
            var el = document.getElementById('timer');
            el.textContent = sec;
            el.className = 'timer-display' + (sec <= 5 ? ' urgent' : '');

            // Show hint at HINT_TIME
            if (sec <= (ROUND_TIME - HINT_TIME) && !hintShown) {
                hintShown = true;
                document.getElementById('hintText').textContent = currentPuzzle.hint;
                document.getElementById('hintBox').style.display = 'flex';
            }
        }, function () {
            // Time's up
            if (!mySolved) {
                document.getElementById('guessInput').disabled = true;
                document.getElementById('guessFeedback').textContent = "Time's up!";
                document.getElementById('guessFeedback').className = 'guess-feedback wrong';
            }
            // Host sends timeout after a brief pause
            if (GameBase.isHost()) {
                setTimeout(function () {
                    GameBase.send('emoji:timeout', { round: currentRound });
                }, 1500);
            }
        });
    });

    // --- Guessing ---

    window.submitGuess = function () {
        if (mySolved || !currentPuzzle) return;

        var input = document.getElementById('guessInput');
        var guess = input.value.trim();
        if (!guess) return;

        input.value = '';
        var elapsed = Date.now() - roundStartTime;
        var match = fuzzyMatch(guess, currentPuzzle.answer);

        if (match === 'correct') {
            mySolved = true;
            var pts = POINTS_CORRECT;
            if (elapsed < 10000) pts += POINTS_SPEED_BONUS;
            if (!hintShown) pts += POINTS_PRE_HINT;

            document.getElementById('guessInput').disabled = true;
            document.getElementById('guessFeedback').textContent = 'Correct! +' + pts + ' points';
            document.getElementById('guessFeedback').className = 'guess-feedback correct';

            GameBase.send('emoji:guess', {
                round: currentRound,
                guess: guess,
                correct: true,
                points: pts,
                time: elapsed
            });
        } else {
            var feedbackText = match === 'close' ? 'Close! Try again...' : 'Wrong!';
            document.getElementById('guessFeedback').textContent = feedbackText;
            document.getElementById('guessFeedback').className = 'guess-feedback ' + match;

            GameBase.send('emoji:guess', {
                round: currentRound,
                guess: guess,
                correct: false,
                points: 0,
                time: elapsed
            });
        }
    };

    // --- Fuzzy Matching ---

    function fuzzyMatch(guess, answer) {
        var g = normalize(guess);
        var a = normalize(answer);

        if (g === a) return 'correct';

        // Levenshtein distance
        if (levenshtein(g, a) <= 2) return 'correct';

        // Check if guess is a significant substring
        if (a.length > 4 && g.length > 3 && a.indexOf(g) !== -1) return 'close';
        if (g.length > 4 && a.length > 3 && g.indexOf(a) !== -1) return 'correct';

        // Close if Levenshtein <= 4
        if (levenshtein(g, a) <= 4) return 'close';

        return 'wrong';
    }

    function normalize(s) {
        return s.toLowerCase()
            .replace(/^(the|a|an)\s+/i, '')
            .replace(/[^a-z0-9]/g, '');
    }

    function levenshtein(a, b) {
        var m = a.length, n = b.length;
        var dp = [];
        for (var i = 0; i <= m; i++) {
            dp[i] = [i];
            for (var j = 1; j <= n; j++) {
                dp[i][j] = i === 0 ? j : 0;
            }
        }
        for (var i = 1; i <= m; i++) {
            for (var j = 1; j <= n; j++) {
                if (a[i - 1] === b[j - 1]) {
                    dp[i][j] = dp[i - 1][j - 1];
                } else {
                    dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
                }
            }
        }
        return dp[m][n];
    }

    // --- Receive Guesses ---

    GameBase.on('emoji:guess', function (data) {
        var log = document.getElementById('guessLog');
        var name = (scores[data.senderId] || {}).name || data.senderName || 'Anon';
        var div = document.createElement('div');
        div.className = 'log-entry' + (data.payload.correct ? ' correct-entry' : '');

        if (data.payload.correct) {
            div.innerHTML = '<span>' + GameBase.escapeHtml(name) + ' guessed correctly!</span><span>+' + data.payload.points + '</span>';
            // Update score
            if (scores[data.senderId]) {
                scores[data.senderId].score += data.payload.points;
                scores[data.senderId].correct++;
            }
        } else {
            div.innerHTML = '<span>' + GameBase.escapeHtml(name) + ': ' + GameBase.escapeHtml(data.payload.guess) + '</span><span>✗</span>';
        }

        log.insertBefore(div, log.firstChild);
    });

    // --- Hint from server (not needed since client handles locally, but kept for sync) ---

    GameBase.on('emoji:hint', function () {
        if (!hintShown && currentPuzzle) {
            hintShown = true;
            document.getElementById('hintText').textContent = currentPuzzle.hint;
            document.getElementById('hintBox').style.display = 'flex';
        }
    });

    // --- Round Timeout ---

    GameBase.on('emoji:timeout', function (data) {
        if (timer) timer.stop();
        showRoundResult();
    });

    function showRoundResult() {
        document.getElementById('roundResultTitle').textContent = 'Round ' + currentRound + ' Complete!';
        document.getElementById('resultEmoji').textContent = currentPuzzle ? currentPuzzle.emoji : '';
        document.getElementById('resultAnswer').textContent = currentPuzzle ? currentPuzzle.answer : '';

        // Show per-player scores this round
        var container = document.getElementById('roundScores');
        container.innerHTML = '';
        var sorted = Object.keys(scores).sort(function (a, b) {
            return scores[b].score - scores[a].score;
        });
        sorted.forEach(function (id) {
            var s = scores[id];
            var div = document.createElement('div');
            div.className = 'round-score-item';
            div.innerHTML = '<span>' + GameBase.escapeHtml(s.name) + '</span><span class="pts">' + s.score + ' pts</span>';
            container.appendChild(div);
        });

        GameBase.showScreen('screenRoundResult');

        // Host starts next round or final
        if (GameBase.isHost()) {
            setTimeout(function () {
                if (currentRound >= TOTAL_ROUNDS) {
                    GameBase.send('emoji:final', { scores: scores });
                } else {
                    startNextRound(currentRound + 1);
                }
            }, 3000);
        }
    }

    // --- Final Scoreboard ---

    GameBase.on('emoji:final', function (data) {
        var hostScores = data.payload.scores || scores;
        Object.keys(hostScores).forEach(function (id) {
            if (scores[id]) {
                scores[id].score = Math.max(scores[id].score, hostScores[id].score || 0);
                scores[id].correct = Math.max(scores[id].correct, hostScores[id].correct || 0);
            }
        });
        showFinalScoreboard();
    });

    function showFinalScoreboard() {
        if (timer) timer.stop();
        GameBase.showScreen('screenScoreboard');
        var tbody = document.getElementById('scoreBody');
        tbody.innerHTML = '';

        var sorted = Object.keys(scores).sort(function (a, b) {
            return scores[b].score - scores[a].score;
        });

        var maxScore = scores[sorted[0]] ? scores[sorted[0]].score : 0;

        sorted.forEach(function (id) {
            var s = scores[id];
            var tr = document.createElement('tr');
            if (s.score === maxScore && maxScore > 0) tr.className = 'winner';
            tr.innerHTML =
                '<td>' + GameBase.escapeHtml(s.name) + (id === GameBase.myId ? ' (You)' : '') + '</td>' +
                '<td>' + s.score + '</td>' +
                '<td>' + s.correct + '/' + TOTAL_ROUNDS + '</td>';
            tbody.appendChild(tr);
        });
    }

    // --- Play Again ---

    window.onPlayAgain = function () {
        Object.keys(scores).forEach(function (id) {
            scores[id].score = 0;
            scores[id].correct = 0;
        });
        currentRound = 0;
        usedPuzzles = [];
        currentPuzzle = null;
        if (timer) timer.stop();

        var players = GameBase.players;
        Object.keys(players).forEach(function (id) {
            players[id].ready = false;
        });

        document.getElementById('btnReady').disabled = false;
        document.getElementById('btnReady').innerHTML = '<span>✋</span> Ready!';
        document.getElementById('readyStatus').textContent = '';
        GameBase.showScreen('screenWaiting');
    };

})();
