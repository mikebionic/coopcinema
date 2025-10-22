package main

import (
	"log"
	"net/http"
	"sync"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

type Message struct {
	Type      string  `json:"type"`      // "play", "pause", "seek"
	Timestamp float64 `json:"timestamp"` // current video time
}

type Client struct {
	conn *websocket.Conn
	send chan Message
}

type Hub struct {
	clients    map[*Client]bool
	broadcast  chan Message
	register   chan *Client
	unregister chan *Client
	mu         sync.Mutex
}

func newHub() *Hub {
	return &Hub{
		clients:    make(map[*Client]bool),
		broadcast:  make(chan Message),
		register:   make(chan *Client),
		unregister: make(chan *Client),
	}
}

func (h *Hub) run() {
	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			h.clients[client] = true
			h.mu.Unlock()
			log.Printf("Client connected. Total clients: %d", len(h.clients))

		case client := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				close(client.send)
			}
			h.mu.Unlock()
			log.Printf("Client disconnected. Total clients: %d", len(h.clients))

		case message := <-h.broadcast:
			h.mu.Lock()
			for client := range h.clients {
				select {
				case client.send <- message:
				default:
					close(client.send)
					delete(h.clients, client)
				}
			}
			h.mu.Unlock()
		}
	}
}

func (c *Client) readPump(hub *Hub) {
	defer func() {
		hub.unregister <- c
		c.conn.Close()
	}()

	for {
		var msg Message
		err := c.conn.ReadJSON(&msg)
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("error: %v", err)
			}
			break
		}
		hub.broadcast <- msg
	}
}

func (c *Client) writePump() {
	defer c.conn.Close()

	for message := range c.send {
		err := c.conn.WriteJSON(message)
		if err != nil {
			return
		}
	}
}

func serveWs(hub *Hub, w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println(err)
		return
	}

	client := &Client{
		conn: conn,
		send: make(chan Message, 256),
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

const htmlContent = `<!DOCTYPE html>
<html>
<head>
    <title>Synchronized Video Player</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            max-width: 1200px;
            margin: 50px auto;
            padding: 20px;
            background: #f0f0f0;
        }
        .container {
            background: white;
            padding: 30px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        h1 {
            margin-top: 0;
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
            border-color: #4CAF50;
            background: #e8f5e9;
        }
        video {
            width: 100%;
            max-width: 100%;
            background: #000;
            margin: 20px 0;
            display: none;
        }
        video.active {
            display: block;
        }
        .status {
            padding: 10px;
            margin: 10px 0;
            border-radius: 4px;
            font-weight: bold;
        }
        .status.connected {
            background: #c8e6c9;
            color: #2e7d32;
        }
        .status.disconnected {
            background: #ffcdd2;
            color: #c62828;
        }
        .info {
            color: #666;
            margin-top: 10px;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>Synchronized Video Player</h1>
        <div id="status" class="status disconnected">Disconnected</div>
        
        <div id="dropZone" class="drop-zone">
            <p>Drop a video file here or click to select</p>
            <input type="file" id="fileInput" accept="video/*" style="display: none;">
        </div>
        
        <video id="videoPlayer" controls></video>
        
        <div class="info">
            <p>Instructions:</p>
            <ul>
                <li>Drop a video file from your computer</li>
                <li>Open this page on multiple computers (same network)</li>
                <li>Play/pause or seek on any computer to sync all players</li>
            </ul>
        </div>
    </div>

    <script>
        const video = document.getElementById('videoPlayer');
        const dropZone = document.getElementById('dropZone');
        const fileInput = document.getElementById('fileInput');
        const status = document.getElementById('status');
        
        let ws;
        let isLocalAction = false;
        
        function connect() {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            ws = new WebSocket(protocol + '//' + window.location.host + '/ws');
            
            ws.onopen = () => {
                status.textContent = 'Connected';
                status.className = 'status connected';
            };
            
            ws.onclose = () => {
                status.textContent = 'Disconnected';
                status.className = 'status disconnected';
                setTimeout(connect, 3000);
            };
            
            ws.onmessage = (event) => {
                const msg = JSON.parse(event.data);
                isLocalAction = false;
                
                if (msg.type === 'play') {
                    video.currentTime = msg.timestamp;
                    video.play();
                } else if (msg.type === 'pause') {
                    video.currentTime = msg.timestamp;
                    video.pause();
                } else if (msg.type === 'seek') {
                    video.currentTime = msg.timestamp;
                }
            };
        }
        
        function sendMessage(type) {
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: type,
                    timestamp: video.currentTime
                }));
            }
        }
        
        video.addEventListener('play', () => {
            if (isLocalAction) {
                sendMessage('play');
            }
            isLocalAction = true;
        });
        
        video.addEventListener('pause', () => {
            if (isLocalAction) {
                sendMessage('pause');
            }
            isLocalAction = true;
        });
        
        video.addEventListener('seeked', () => {
            if (isLocalAction) {
                sendMessage('seek');
            }
            isLocalAction = true;
        });
        
        // Drag and drop
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
        
        connect();
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

	addr := ":8080"
	log.Printf("Server starting on %s", addr)
	err := http.ListenAndServe(addr, nil)
	if err != nil {
		log.Fatal("ListenAndServe: ", err)
	}
}
