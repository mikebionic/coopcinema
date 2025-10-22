package handlers

import (
	"coopcinema/config"
	"coopcinema/hub"
	"coopcinema/models"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"github.com/gorilla/websocket"
	"log"
	"net/http"
	"time"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

var cfg = config.Load()

func ServeWs(h *hub.Hub, w http.ResponseWriter, r *http.Request) {
	roomCode := r.URL.Query().Get("room")
	userName := r.URL.Query().Get("name")
	userID := r.URL.Query().Get("id")

	if roomCode == "" || userName == "" || userID == "" {
		http.Error(w, "Missing room, name or id", http.StatusBadRequest)
		return
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println(err)
		return
	}

	client := &models.Client{
		ID:       userID,
		Name:     userName,
		Conn:     conn,
		Send:     make(chan models.Message, cfg.ClientSendBuffer),
		RoomCode: roomCode,
	}

	h.Register <- client

	go writePump(client, conn)
	go readPump(client, conn, h)
}

func readPump(client *models.Client, conn *websocket.Conn, h *hub.Hub) {
	defer func() {
		h.Unregister <- client
		conn.Close()
	}()

	conn.SetReadDeadline(time.Now().Add(cfg.ReadTimeout))
	conn.SetPongHandler(func(string) error {
		conn.SetReadDeadline(time.Now().Add(cfg.ReadTimeout))
		return nil
	})

	for {
		var msg models.Message
		err := conn.ReadJSON(&msg)
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("error: %v", err)
			}
			break
		}
		msg.UserID = client.ID
		h.Broadcast(msg, client)
	}
}

func writePump(client *models.Client, conn *websocket.Conn) {
	ticker := time.NewTicker(cfg.PingInterval)
	defer func() {
		ticker.Stop()
		conn.Close()
	}()

	for {
		select {
		case message, ok := <-client.Send:
			conn.SetWriteDeadline(time.Now().Add(cfg.WriteTimeout))
			if !ok {
				conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			err := conn.WriteJSON(message)
			if err != nil {
				return
			}

		case <-ticker.C:
			conn.SetWriteDeadline(time.Now().Add(cfg.WriteTimeout))
			if err := conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

func ServeGenerateRoom(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(models.RoomCodeResponse{
		Code: generateRoomCode(),
	})
}

func generateRoomCode() string {
	b := make([]byte, 4)
	rand.Read(b)
	return hex.EncodeToString(b)
}
