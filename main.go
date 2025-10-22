package main

import (
	"coopcinema/config"
	"coopcinema/handlers"
	"coopcinema/hub"
	"log"
	"net/http"
)

func main() {
	cfg := config.Load()

	h := hub.NewHub()
	go h.Run()

	fs := http.FileServer(http.Dir("./public"))
	http.Handle("/", fs)

	http.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		handlers.ServeWs(h, w, r)
	})

	http.HandleFunc("/generate-room", handlers.ServeGenerateRoom)

	log.Printf("🎬 Co-op Video Theater starting on %s", cfg.ServerAddr)
	log.Printf("📂 Serving static files from ./public")

	if err := http.ListenAndServe(cfg.ServerAddr, nil); err != nil {
		log.Fatal("ListenAndServe: ", err)
	}
}
