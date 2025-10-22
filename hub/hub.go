package hub

import (
	"coopcinema/models"
	"encoding/json"
	"log"
	"sync"
)

type Hub struct {
	Rooms      map[string]*models.Room
	Register   chan *models.Client
	Unregister chan *models.Client
	mu         sync.RWMutex
}

func NewHub() *Hub {
	return &Hub{
		Rooms:      make(map[string]*models.Room),
		Register:   make(chan *models.Client),
		Unregister: make(chan *models.Client),
	}
}

func (h *Hub) Run() {
	for {
		select {
		case client := <-h.Register:
			h.registerClient(client)
		case client := <-h.Unregister:
			h.unregisterClient(client)
		}
	}
}

func (h *Hub) registerClient(client *models.Client) {
	h.mu.Lock()
	room, exists := h.Rooms[client.RoomCode]
	if !exists {
		room = &models.Room{
			Code:    client.RoomCode,
			Clients: make(map[interface{}]bool),
		}
		h.Rooms[client.RoomCode] = room
	}
	h.mu.Unlock()

	room.Clients[client] = true
	log.Printf("✅ Client %s (%s) joined room %s. Room size: %d",
		client.ID, client.Name, client.RoomCode, len(room.Clients))

	h.BroadcastUserList(room)
}

func (h *Hub) unregisterClient(client *models.Client) {
	h.mu.RLock()
	room, exists := h.Rooms[client.RoomCode]
	h.mu.RUnlock()

	if exists {
		if _, ok := room.Clients[client]; ok {
			delete(room.Clients, client)
			close(client.Send)
			log.Printf("❌ Client %s (%s) left room %s. Room size: %d",
				client.ID, client.Name, client.RoomCode, len(room.Clients))
		}

		h.BroadcastUserList(room)

		if len(room.Clients) == 0 {
			h.mu.Lock()
			delete(h.Rooms, client.RoomCode)
			h.mu.Unlock()
			log.Printf("🗑️  Room %s deleted (empty)", client.RoomCode)
		}
	}
}

func (h *Hub) BroadcastUserList(room *models.Room) {
	users := []map[string]string{}
	for c := range room.Clients {
		client := c.(*models.Client)
		users = append(users, map[string]string{
			"id":   client.ID,
			"name": client.Name,
		})
	}

	userListJSON, _ := json.Marshal(users)
	msg := models.Message{
		Type:     "userList",
		UserName: string(userListJSON),
	}

	for c := range room.Clients {
		client := c.(*models.Client)
		select {
		case client.Send <- msg:
		default:
			close(client.Send)
			delete(room.Clients, client)
		}
	}
}

func (h *Hub) Broadcast(msg models.Message, sender *models.Client) {
	h.mu.RLock()
	room, exists := h.Rooms[sender.RoomCode]
	h.mu.RUnlock()

	if !exists {
		return
	}

	for c := range room.Clients {
		client := c.(*models.Client)
		if client != sender {
			select {
			case client.Send <- msg:
			default:
				close(client.Send)
				delete(room.Clients, client)
			}
		}
	}
}
