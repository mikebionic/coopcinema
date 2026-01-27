package models

type Message struct {
	Type       string  `json:"type"`
	Timestamp  float64 `json:"timestamp"`
	RoomCode   string  `json:"roomCode,omitempty"`
	UserName   string  `json:"userName,omitempty"`
	UserID     string  `json:"userID,omitempty"`
	URL        string  `json:"url,omitempty"`
	Content    string  `json:"content,omitempty"`
	SentAt     float64 `json:"sentAt,omitempty"`
	SourceType string  `json:"sourceType,omitempty"`
	Playing    bool    `json:"playing,omitempty"`
}

type Client struct {
	ID       string
	Name     string
	Conn     interface{} // *websocket.Conn
	Send     chan Message
	RoomCode string
}

type Room struct {
	Code    string
	Clients map[interface{}]bool
}

type RoomCodeResponse struct {
	Code string `json:"code"`
}
