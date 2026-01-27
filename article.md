# I Built a Synchronized Video Player in a Weekend Because Watch Parties Shouldn't Be This Hard

You know that moment when you're on a call with a friend, you both open the same YouTube video, and someone says "okay, 3... 2... 1... play!" — and you're still 4 seconds apart the entire time?

That was my pain. A stupid, small, annoying pain. And it turned into a weekend project.

## The Problem

I live far from some of my closest friends. We like watching stuff together — movie trailers, conference talks, random YouTube rabbit holes at 2 AM. Every existing solution had a catch:

- **Teleparty / Watch2Gether** — browser extensions, account walls, or limited to Netflix/YouTube
- **Discord screen share** — kills the video quality, eats bandwidth, and the person sharing can't resize their window without everyone suffering
- **"Ready? 3... 2... 1..."** — never actually works

I wanted something dead simple. Open a link, paste a YouTube URL, and you're watching together. No installs, no accounts, no extensions.

## The Idea

What if the server did almost nothing?

Seriously. What if the server was just a dumb relay — a WebSocket hub that receives a JSON message from one client and broadcasts it to everyone else in the room? No video processing. No transcoding. No storage. No authentication. Just: *"hey, someone pressed play at timestamp 42.5 seconds — pass it on."*

The clients handle everything. Each browser loads the video independently (YouTube iframe, Vimeo embed, local file, whatever), and they just keep each other in sync through tiny JSON messages.

That's it. That's the architecture.

## One Weekend, Go + Vanilla JS

The backend is about 200 lines of Go. A WebSocket hub manages rooms. Clients connect, join a room, and every message they send gets broadcast to everyone else in that room (except themselves). The server doesn't know or care what a "play" or "pause" means. It just relays.

```go
func (h *Hub) Broadcast(msg models.Message, sender *models.Client) {
    h.mu.RLock()
    defer h.mu.RUnlock()
    room := h.rooms[sender.RoomCode]
    for client := range room {
        if client != sender {
            client.Send <- msg
        }
    }
}
```

The frontend is vanilla JavaScript. No React, no Vue, no build step. One HTML file, one JS file, one CSS file. The JS handles:

- Detecting what kind of URL you pasted (YouTube? Vimeo? Twitch? Direct `.mp4` link?)
- Loading the right player (YouTube IFrame API, Vimeo SDK, Twitch Embed, or a plain `<video>` tag)
- Intercepting play/pause/seek events and sending them over WebSocket
- Receiving those events from peers and applying them locally

The sync logic is surprisingly simple. When someone presses play, the client sends:

```json
{
  "type": "play",
  "timestamp": 42.5,
  "sentAt": 1706000000000
}
```

The receiver checks: am I more than 0.5 seconds off from 42.5? If yes, seek first. Then play. The `sentAt` field lets receivers estimate network latency and adjust the seek target by half the round-trip time. It's not perfect, but it's close enough that you don't notice.

## Beyond the Basics

Once the core sync worked, the fun features came fast:

**Chat with toast popups** — a slide-in chat sidebar with notification toasts that stack up when the chat is closed. Click a toast, chat opens. No message missed.

**Emoji reactions** — click an emoji and it floats up over the video with your name underneath it. Everyone sees it. Stupid simple, genuinely fun during a tense movie scene.

**Theater Fullscreen** — YouTube's native fullscreen hides everything — no chat, no reactions, no toasts. So I built a custom fullscreen that uses the Fullscreen API on a wrapper div containing the video, reactions, chat, and controls. Everything stays visible.

**Buffering sync** — if one person's connection stutters, everyone pauses automatically. When they're ready, everyone resumes. No one misses a scene because their friend has slower internet.

**Host mode** — the room creator can enable host mode, where only the host's playback controls sync. Everyone else just watches. Click someone's badge to transfer host.

## DevFest Ashgabat 2025

I used Co-op Cinema as the demo project for my talk at [DevFest Ashgabat 2025](https://gdg.community.dev/events/details/google-gdg-ashgabat-presents-devfest-ashgabat-2025-a-glimpse-into-the-future-of-tech/) — *"Code. Build. Deploy. Repeat. GitHub Pipelines & Cloud Deployments for Go."*

The talk was about CI/CD pipelines with GitHub Actions and deploying Go apps to production. Co-op Cinema was the app we built the pipeline around — from feature branches to automated builds to cloud deployment. About 690 people attended.

You can watch the full session on [YouTube](https://youtu.be/yfzkSp3TlT4) or check the [slides](https://docs.google.com/presentation/d/14vg2_i91qOmdQ1yzyZTImcgbh_ejWJ8Oi3I729aS3wA/edit?usp=sharing).

The irony of demonstrating a deployment pipeline for a watch party app — during a live event where hundreds of people were watching together in the same room — was not lost on me.

## Deploying It (for Free)

The whole thing is Dockerized. One command:

```bash
cp .env.example .env
docker compose up -d
```

For public access, I deployed to [Render](https://render.com) — free tier, Docker runtime, auto-deploys from GitHub on every push. The `render.yaml` blueprint means you can fork the repo and deploy in two clicks.

The Go binary is ~10MB. The Docker image is ~15MB. The server uses almost no memory or CPU because it does almost nothing. Perfect for a free tier.

## What I Learned

**The dumbest server is sometimes the best server.** A stateless WebSocket relay with zero business logic handles every video source, every player API, and every edge case — because the clients do all the work. The server will never need updating when I add a new video source.

**Vanilla JS is fine.** No framework, no build step, no node_modules. The entire frontend is one HTML file, one JS file, one CSS file. It loads instantly. It works everywhere. Adding features means editing a function, not configuring a pipeline.

**Sync is about tolerance, not precision.** You don't need millisecond-perfect sync for a watch party. Half-second tolerance, debounced events, and a latency offset get you 95% of the way there. The remaining 5% doesn't matter because humans can't tell.

## Try It

The project is open source. Fork it, deploy it, watch something with someone who's far away.

**GitHub:** [coopcinema](https://github.com/mikebionic/coopcinema)

Or just grab Docker and run it locally in 10 seconds:

```bash
git clone https://github.com/mikebionic/coopcinema.git
cd coopcinema
cp .env.example .env
docker compose up -d
```

Open `localhost:8080`, create a room, share the link. That's it.

---

*Built with Go, gorilla/websocket, and vanilla JavaScript. No frameworks were harmed in the making of this project.*
