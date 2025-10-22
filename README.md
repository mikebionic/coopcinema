# Co-op Cinema - Technical Summary

## Purpose
Real-time synchronized video player that allows multiple users to watch local video files together across different computers, with synchronized playback controls.

## Core Functionality

### Room System
- Users create or join rooms using unique 8-character hex codes
- Room creator gets auto-generated theatrical name (e.g., "Stellar Cinema")
- Rooms can be shared via:
    - Direct room code (copy to clipboard)
    - Full shareable URL with pre-filled room code
- Rooms auto-delete when empty

### Video Synchronization
- Each user loads their own local video file (no upload - uses browser File API)
- Actions synchronized across all room participants:
    - **Play/Pause**: All players start/stop simultaneously
    - **Seek**: Timeline jumps sync across all players
    - **Timestamp**: Current playback position sent with each action

### User Presence
- Real-time display of all connected users in room
- Each user identified by their chosen/generated name
- Visual distinction for current user (green badge vs purple)
- Live updates when users join/leave

## Technical Architecture

### Backend (Go)
- **WebSocket server** for real-time bidirectional communication
- **Room-based hub system**: Isolated message broadcasting per room
- **Client management**: Tracks connections, room membership, user metadata
- **Ping/pong keepalive**: 54s intervals with 60s timeout
- **Automatic cleanup**: Removes disconnected clients and empty rooms

### Frontend (HTML/JS)
- **Single-page application** with lobby and room views
- **WebSocket client** with auto-reconnection (3s delay)
- **Debouncing system**:
    - 100ms for play/pause events
    - 200ms for seek events
    - Prevents lag from rapid-fire actions
- **Smart sync logic**: Only seeks if time difference > 0.5s to avoid jitter
- **Local-only file handling**: Uses `createObjectURL()` - no server upload

### Message Protocol
```json
{
  "type": "play|pause|seek|userList",
  "timestamp": 123.45,
  "userID": "abc123xyz",
  "userName": "Stellar Cinema"
}
```

### Sync Optimization
- **Event batching**: 50ms timeout to group rapid events
- **Time threshold**: 0.5s minimum difference before syncing timestamp
- **Local action flag**: Prevents echo loops (sender doesn't re-sync their own actions)
- **Cleared timeouts**: Cancel pending syncs when new events arrive

## Key Design Decisions
- **No video upload**: Files stay on local machine (privacy + performance)
- **Room isolation**: Messages only broadcast within same room
- **Persistent connection**: WebSocket maintains state, auto-reconnects
- **Generated names**: Users get themed theatrical names by default
- **Graceful degradation**: Shows connection status, handles disconnects

## Dependencies
- `gorilla/websocket` (Go) - WebSocket implementation
- Native browser APIs only (no frontend libraries)

## Use Cases
- Remote watch parties with friends/family
- Synchronized video presentations across locations
- Collaborative video review/editing sessions
- Distance learning with synchronized lecture videos