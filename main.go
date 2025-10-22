package main

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

type Message struct {
	Type      string  `json:"type"`
	Timestamp float64 `json:"timestamp"`
	RoomCode  string  `json:"roomCode,omitempty"`
	UserName  string  `json:"userName,omitempty"`
	UserID    string  `json:"userID,omitempty"`
}

type Client struct {
	id       string
	name     string
	conn     *websocket.Conn
	send     chan Message
	roomCode string
}

type Room struct {
	code    string
	clients map[*Client]bool
	mu      sync.Mutex
}

type Hub struct {
	rooms      map[string]*Room
	register   chan *Client
	unregister chan *Client
	mu         sync.RWMutex
}

func newHub() *Hub {
	return &Hub{
		rooms:      make(map[string]*Room),
		register:   make(chan *Client),
		unregister: make(chan *Client),
	}
}

func (h *Hub) run() {
	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			room, exists := h.rooms[client.roomCode]
			if !exists {
				room = &Room{
					code:    client.roomCode,
					clients: make(map[*Client]bool),
				}
				h.rooms[client.roomCode] = room
			}
			h.mu.Unlock()

			room.mu.Lock()
			room.clients[client] = true
			room.mu.Unlock()

			log.Printf("Client %s (%s) joined room %s. Room size: %d", client.id, client.name, client.roomCode, len(room.clients))

			// Notify all clients in room about current users
			h.broadcastUserList(room)

		case client := <-h.unregister:
			h.mu.RLock()
			room, exists := h.rooms[client.roomCode]
			h.mu.RUnlock()

			if exists {
				room.mu.Lock()
				if _, ok := room.clients[client]; ok {
					delete(room.clients, client)
					close(client.send)
					log.Printf("Client %s (%s) left room %s. Room size: %d", client.id, client.name, client.roomCode, len(room.clients))
				}
				room.mu.Unlock()

				h.broadcastUserList(room)

				// Clean up empty rooms
				if len(room.clients) == 0 {
					h.mu.Lock()
					delete(h.rooms, client.roomCode)
					h.mu.Unlock()
					log.Printf("Room %s deleted (empty)", client.roomCode)
				}
			}
		}
	}
}

func (h *Hub) broadcastUserList(room *Room) {
	room.mu.Lock()
	defer room.mu.Unlock()

	users := []map[string]string{}
	for client := range room.clients {
		users = append(users, map[string]string{
			"id":   client.id,
			"name": client.name,
		})
	}

	userListJSON, _ := json.Marshal(users)
	msg := Message{
		Type:     "userList",
		UserName: string(userListJSON),
	}

	for client := range room.clients {
		select {
		case client.send <- msg:
		default:
			close(client.send)
			delete(room.clients, client)
		}
	}
}

func (h *Hub) broadcast(msg Message, sender *Client) {
	h.mu.RLock()
	room, exists := h.rooms[sender.roomCode]
	h.mu.RUnlock()

	if !exists {
		return
	}

	room.mu.Lock()
	defer room.mu.Unlock()

	for client := range room.clients {
		if client != sender {
			select {
			case client.send <- msg:
			default:
				close(client.send)
				delete(room.clients, client)
			}
		}
	}
}

func (c *Client) readPump(hub *Hub) {
	defer func() {
		hub.unregister <- c
		c.conn.Close()
	}()

	c.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	c.conn.SetPongHandler(func(string) error {
		c.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		return nil
	})

	for {
		var msg Message
		err := c.conn.ReadJSON(&msg)
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("error: %v", err)
			}
			break
		}
		msg.UserID = c.id
		hub.broadcast(msg, c)
	}
}

func (c *Client) writePump() {
	ticker := time.NewTicker(54 * time.Second)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.send:
			c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if !ok {
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			err := c.conn.WriteJSON(message)
			if err != nil {
				return
			}

		case <-ticker.C:
			c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

func generateRoomCode() string {
	b := make([]byte, 4)
	rand.Read(b)
	return hex.EncodeToString(b)
}

func serveWs(hub *Hub, w http.ResponseWriter, r *http.Request) {
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

	client := &Client{
		id:       userID,
		name:     userName,
		conn:     conn,
		send:     make(chan Message, 256),
		roomCode: roomCode,
	}

	hub.register <- client

	go client.writePump()
	go client.readPump(hub)
}

func serveHome(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/" {
		http.Error(w, "Not found", http.StatusNotFound)
		return
	}
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Write([]byte(htmlContent))
}

func serveGenerateRoom(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"code": generateRoomCode(),
	})
}

const htmlContent = `<!DOCTYPE html>
<html>
<head>
    <title>Synchronized Video Player</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: Arial, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
        }
        .lobby, .room {
            background: white;
            padding: 40px;
            border-radius: 12px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.2);
        }
        .lobby { display: block; }
        .room { display: none; }
        h1 { color: #333; margin-bottom: 30px; text-align: center; }
        .input-group {
            margin-bottom: 20px;
        }
        label {
            display: block;
            margin-bottom: 8px;
            color: #555;
            font-weight: bold;
        }
        input[type="text"] {
            width: 100%;
            padding: 12px;
            border: 2px solid #ddd;
            border-radius: 6px;
            font-size: 16px;
        }
        button {
            background: #667eea;
            color: white;
            border: none;
            padding: 14px 28px;
            border-radius: 6px;
            font-size: 16px;
            cursor: pointer;
            font-weight: bold;
            transition: background 0.3s;
        }
        button:hover { background: #5568d3; }
        button:active { transform: scale(0.98); }
        .btn-secondary {
            background: #6c757d;
        }
        .btn-secondary:hover { background: #5a6268; }
        .divider {
            text-align: center;
            margin: 30px 0;
            color: #999;
            position: relative;
        }
        .divider:before {
            content: "";
            position: absolute;
            left: 0;
            top: 50%;
            width: 45%;
            height: 1px;
            background: #ddd;
        }
        .divider:after {
            content: "";
            position: absolute;
            right: 0;
            top: 50%;
            width: 45%;
            height: 1px;
            background: #ddd;
        }
        .room-info {
            background: #f8f9fa;
            padding: 20px;
            border-radius: 8px;
            margin-bottom: 20px;
        }
        .room-code-box {
            display: flex;
            gap: 10px;
            align-items: center;
            margin-top: 10px;
        }
        .room-code {
            background: white;
            padding: 10px 15px;
            border-radius: 6px;
            font-family: monospace;
            font-size: 20px;
            font-weight: bold;
            color: #667eea;
            flex: 1;
            border: 2px solid #667eea;
        }
        .btn-small {
            padding: 10px 15px;
            font-size: 14px;
        }
        .drop-zone {
            border: 3px dashed #ccc;
            border-radius: 8px;
            padding: 50px;
            text-align: center;
            margin: 20px 0;
            background: #fafafa;
            cursor: pointer;
        }
        .drop-zone.dragover {
            border-color: #667eea;
            background: #f0f0ff;
        }
        video {
            width: 100%;
            background: #000;
            margin: 20px 0;
            border-radius: 8px;
            display: none;
        }
        video.active { display: block; }
        .users {
            display: flex;
            gap: 10px;
            flex-wrap: wrap;
            margin-top: 15px;
        }
        .user-badge {
            background: #667eea;
            color: white;
            padding: 6px 12px;
            border-radius: 20px;
            font-size: 14px;
        }
        .user-badge.me {
            background: #28a745;
        }
        .status {
            display: inline-block;
            width: 10px;
            height: 10px;
            border-radius: 50%;
            margin-right: 8px;
        }
        .status.connected { background: #28a745; }
        .status.disconnected { background: #dc3545; }
    </style>
</head>
<body>
    <div class="container">
        <div class="lobby" id="lobby">
            <h1>🎬 Co-op Video Theater</h1>
            
            <div class="input-group">
                <label>Your Name</label>
                <input type="text" id="userName" placeholder="Enter your name">
            </div>
            
            <button onclick="createRoom()" style="width: 100%; margin-bottom: 10px;">
                🎭 Start Co-op Viewing
            </button>
            
            <div class="divider">OR</div>
            
            <div class="input-group">
                <label>Room Code</label>
                <input type="text" id="roomCodeInput" placeholder="Enter room code">
            </div>
            
            <button onclick="joinRoom()" style="width: 100%;" class="btn-secondary">
                🚪 Enter Room
            </button>
        </div>
        
        <div class="room" id="room">
            <h1>🎬 Co-op Video Theater</h1>
            
            <div class="room-info">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <span class="status" id="statusDot"></span>
                        <strong>Room Code:</strong>
                    </div>
                    <button onclick="leaveRoom()" class="btn-small btn-secondary">Leave Room</button>
                </div>
                <div class="room-code-box">
                    <div class="room-code" id="roomCodeDisplay"></div>
                    <button onclick="copyCode()" class="btn-small">Copy Code</button>
                    <button onclick="shareLink()" class="btn-small">Share Link</button>
                </div>
                
                <div style="margin-top: 15px;">
                    <strong>Connected Users:</strong>
                    <div class="users" id="usersList"></div>
                </div>
            </div>
            
            <div id="dropZone" class="drop-zone">
                <p>📹 Drop a video file here or click to select</p>
                <input type="file" id="fileInput" accept="video/*" style="display: none;">
            </div>
            
            <video id="videoPlayer" controls></video>
        </div>
    </div>

    <script>
        const adjectives = ["Stellar", "Cosmic", "Velvet", "Golden", "Silver", "Crimson", "Azure", "Emerald", "Royal", "Grand", "Imperial", "Majestic", "Classic", "Vintage", "Modern", "Electric", "Neon", "Starlight", "Moonlit", "Sunset"];
        const nouns = ["Cinema", "Theater", "Palace", "Auditorium", "Screen", "Pavilion", "Plaza", "Studio", "Hall", "Arena", "Dome", "Stage", "Lounge", "Gallery", "Showroom"];
        
        let ws;
        let currentRoom = null;
        let myUserId = generateId();
        let myUserName = "";
        let isLocalAction = false;
        let syncTimeout = null;
        
        function generateId() {
            return Math.random().toString(36).substr(2, 9);
        }
        
        function generateName() {
            const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
            const noun = nouns[Math.floor(Math.random() * nouns.length)];
            return adj + " " + noun;
        }
        
        document.getElementById('userName').value = generateName();
        
        async function createRoom() {
            myUserName = document.getElementById('userName').value.trim();
            if (!myUserName) {
                alert('Please enter your name');
                return;
            }
            
            const response = await fetch('/generate-room');
            const data = await response.json();
            currentRoom = data.code;
            
            showRoom();
            connectWebSocket();
        }
        
        function joinRoom() {
            myUserName = document.getElementById('userName').value.trim();
            const roomCode = document.getElementById('roomCodeInput').value.trim().toLowerCase();
            
            if (!myUserName) {
                alert('Please enter your name');
                return;
            }
            
            if (!roomCode) {
                alert('Please enter a room code');
                return;
            }
            
            currentRoom = roomCode;
            showRoom();
            connectWebSocket();
        }
        
        function showRoom() {
            document.getElementById('lobby').style.display = 'none';
            document.getElementById('room').style.display = 'block';
            document.getElementById('roomCodeDisplay').textContent = currentRoom.toUpperCase();
        }
        
        function leaveRoom() {
            if (ws) ws.close();
            document.getElementById('lobby').style.display = 'block';
            document.getElementById('room').style.display = 'none';
            document.getElementById('videoPlayer').classList.remove('active');
            document.getElementById('videoPlayer').src = '';
            document.getElementById('dropZone').style.display = 'block';
            currentRoom = null;
        }
        
        function copyCode() {
            navigator.clipboard.writeText(currentRoom.toUpperCase());
            alert('Room code copied!');
        }
        
        function shareLink() {
            const url = window.location.origin + '/?room=' + currentRoom;
            navigator.clipboard.writeText(url);
            alert('Room link copied!');
        }
        
        function connectWebSocket() {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            ws = new WebSocket(protocol + '//' + window.location.host + '/ws?room=' + currentRoom + '&name=' + encodeURIComponent(myUserName) + '&id=' + myUserId);
            
            ws.onopen = () => {
                document.getElementById('statusDot').className = 'status connected';
            };
            
            ws.onclose = () => {
                document.getElementById('statusDot').className = 'status disconnected';
                setTimeout(connectWebSocket, 3000);
            };
            
            ws.onmessage = (event) => {
                const msg = JSON.parse(event.data);
                
                if (msg.type === 'userList') {
                    updateUserList(JSON.parse(msg.userName));
                    return;
                }
                
                const video = document.getElementById('videoPlayer');
                if (!video.src) return;
                
                isLocalAction = false;
                
                // Clear any pending sync
                if (syncTimeout) {
                    clearTimeout(syncTimeout);
                }
                
                // Add small delay to batch rapid events
                syncTimeout = setTimeout(() => {
                    if (msg.type === 'play') {
                        const timeDiff = Math.abs(video.currentTime - msg.timestamp);
                        if (timeDiff > 0.5) {
                            video.currentTime = msg.timestamp;
                        }
                        video.play().catch(e => console.log('Play error:', e));
                    } else if (msg.type === 'pause') {
                        const timeDiff = Math.abs(video.currentTime - msg.timestamp);
                        if (timeDiff > 0.5) {
                            video.currentTime = msg.timestamp;
                        }
                        video.pause();
                    } else if (msg.type === 'seek') {
                        video.currentTime = msg.timestamp;
                    }
                }, 50);
            };
        }
        
        function updateUserList(users) {
            const list = document.getElementById('usersList');
            list.innerHTML = '';
            users.forEach(user => {
                const badge = document.createElement('div');
                badge.className = 'user-badge' + (user.id === myUserId ? ' me' : '');
                badge.textContent = user.name + (user.id === myUserId ? ' (You)' : '');
                list.appendChild(badge);
            });
        }
        
        function sendMessage(type) {
            if (ws && ws.readyState === WebSocket.OPEN) {
                const video = document.getElementById('videoPlayer');
                ws.send(JSON.stringify({
                    type: type,
                    timestamp: video.currentTime
                }));
            }
        }
        
        const video = document.getElementById('videoPlayer');
        let lastEventTime = 0;
        
        function debounceEvent(callback, delay = 100) {
            const now = Date.now();
            if (now - lastEventTime > delay) {
                lastEventTime = now;
                callback();
            }
        }
        
        video.addEventListener('play', () => {
            if (isLocalAction) {
                debounceEvent(() => sendMessage('play'));
            }
            isLocalAction = true;
        });
        
        video.addEventListener('pause', () => {
            if (isLocalAction) {
                debounceEvent(() => sendMessage('pause'));
            }
            isLocalAction = true;
        });
        
        video.addEventListener('seeked', () => {
            if (isLocalAction) {
                debounceEvent(() => sendMessage('seek'), 200);
            }
            isLocalAction = true;
        });
        
        // Drag and drop
        const dropZone = document.getElementById('dropZone');
        const fileInput = document.getElementById('fileInput');
        
        dropZone.addEventListener('click', () => fileInput.click());
        
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('dragover');
        });
        
        dropZone.addEventListener('dragleave', () => {
            dropZone.classList.remove('dragover');
        });
        
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('dragover');
            handleFile(e.dataTransfer.files[0]);
        });
        
        fileInput.addEventListener('change', (e) => {
            handleFile(e.target.files[0]);
        });
        
        function handleFile(file) {
            if (file && file.type.startsWith('video/')) {
                const url = URL.createObjectURL(file);
                video.src = url;
                video.classList.add('active');
                dropZone.style.display = 'none';
            } else {
                alert('Please select a video file');
            }
        }
        
        // Check for room in URL
        const urlParams = new URLSearchParams(window.location.search);
        const roomFromUrl = urlParams.get('room');
        if (roomFromUrl) {
            document.getElementById('roomCodeInput').value = roomFromUrl;
        }
    </script>
</body>
</html>`

func main() {
	hub := newHub()
	go hub.run()

	http.HandleFunc("/", serveHome)
	http.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		serveWs(hub, w, r)
	})
	http.HandleFunc("/generate-room", serveGenerateRoom)

	addr := ":8080"
	log.Printf("Server starting on %s", addr)
	err := http.ListenAndServe(addr, nil)
	if err != nil {
		log.Fatal("ListenAndServe: ", err)
	}
}
