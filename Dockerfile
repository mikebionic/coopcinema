# --- Build stage ---
FROM golang:1.23-alpine AS builder

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o coopcinema .

# --- Run stage ---
FROM alpine:3.20

RUN apk add --no-cache ca-certificates

WORKDIR /app

COPY --from=builder /app/coopcinema .
COPY --from=builder /app/public ./public
COPY --from=builder /app/games-public ./games-public

EXPOSE 8080

CMD ["./coopcinema"]
