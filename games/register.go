package games

import (
	"log"
	"net/http"
)

// Register mounts the /games/ file server when games are enabled.
func Register() {
	fs := http.FileServer(http.Dir("./games-public"))
	// Revalidate on every load so game-logic changes reach clients without a
	// manual hard refresh (304 when unchanged).
	http.Handle("/games/", http.StripPrefix("/games/", noCache(fs)))
	log.Println("🎮 Mini-games module enabled at /games/")
}

func noCache(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-cache, must-revalidate")
		next.ServeHTTP(w, r)
	})
}
