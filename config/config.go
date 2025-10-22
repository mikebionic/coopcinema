package config

import (
	"os"
	"time"
)

type Config struct {
	ServerAddr       string
	PingInterval     time.Duration
	ReadTimeout      time.Duration
	WriteTimeout     time.Duration
	ClientSendBuffer int
}

func Load() *Config {
	addr := os.Getenv("SERVER_ADDR")
	if addr == "" {
		addr = ":8080"
	}

	return &Config{
		ServerAddr:       addr,
		PingInterval:     54 * time.Second,
		ReadTimeout:      60 * time.Second,
		WriteTimeout:     10 * time.Second,
		ClientSendBuffer: 256,
	}
}
