// ============================================
// LOBBY CARDS - Injects mini-game links into lobby
// ============================================

(function () {
    var section = document.getElementById('gamesSection');
    if (!section) return;

    var games = [
        { icon: '\u26A1', title: 'Reaction Duel', players: '2-4 players', href: '/games/reaction-duel/' },
        { icon: '\uD83D\uDD25', title: 'Emoji Decode', players: '2-4 players', href: '/games/emoji-decode/' },
        { icon: '\uD83E\uDD1D', title: 'Split or Steal', players: '2 players', href: '/games/split-or-steal/' }
    ];

    var html = '<div class="games-section glass-card">';
    html += '<h3>\uD83C\uDFAE Mini-Games</h3>';
    html += '<div class="game-cards">';

    games.forEach(function (g) {
        html += '<a class="game-card" href="' + g.href + '">';
        html += '<div class="card-icon">' + g.icon + '</div>';
        html += '<div>';
        html += '<div class="card-title">' + g.title + '</div>';
        html += '<div class="card-players">' + g.players + '</div>';
        html += '</div>';
        html += '</a>';
    });

    html += '</div></div>';
    section.innerHTML = html;
})();
