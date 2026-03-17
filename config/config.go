package config

import (
	"os"
	"strings"
	"time"
)

type Config struct {
	ServerAddr       string
	PingInterval     time.Duration
	ReadTimeout      time.Duration
	WriteTimeout     time.Duration
	ClientSendBuffer int
	GamesEnabled     bool
}

func Load() *Config {
	addr := os.Getenv("SERVER_ADDR")
	if addr == "" {
		// Render and similar platforms set PORT
		if port := os.Getenv("PORT"); port != "" {
			addr = ":" + port
		} else {
			addr = ":8080"
		}
	}

	gamesEnabled := true
	if ge := os.Getenv("GAMES_ENABLED"); ge != "" {
		gamesEnabled = strings.ToLower(ge) != "false"
	}

	return &Config{
		ServerAddr:       addr,
		PingInterval:     54 * time.Second,
		ReadTimeout:      60 * time.Second,
		WriteTimeout:     10 * time.Second,
		ClientSendBuffer: 256,
		GamesEnabled:     gamesEnabled,
	}
}
