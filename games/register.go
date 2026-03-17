package games

import (
	"log"
	"net/http"
)

// Register mounts the /games/ file server when games are enabled.
func Register() {
	fs := http.FileServer(http.Dir("./games-public"))
	http.Handle("/games/", http.StripPrefix("/games/", fs))
	log.Println("🎮 Mini-games module enabled at /games/")
}
