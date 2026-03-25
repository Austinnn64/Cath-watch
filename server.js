// Cath Watch — Global WebSocket Server

const WebSocket = require('ws');

const PORT = process.env.PORT || 8080;

// Create server
const wss = new WebSocket.Server({ port: PORT });

// Rooms storage
const rooms = {}; 
// structure:
// rooms[code] = {
//   clients: Set<WebSocket>,
//   state: { videoSrc, currentTime, playing }
// }

console.log("🚀 WebSocket server running on port", PORT);

// Helper: broadcast to room
function broadcast(roomCode, data, exclude = null) {
  if (!rooms[roomCode]) return;

  rooms[roomCode].clients.forEach(client => {
    if (client !== exclude && client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
}

// Handle connections
wss.on('connection', (ws) => {
  let roomCode = null;

  ws.on('message', (message) => {
    let data;

    try {
      data = JSON.parse(message);
    } catch {
      return;
    }

    const { type, payload, code } = data;

    // ─────────────── JOIN ROOM ───────────────
    if (type === 'join') {
      roomCode = code;

      if (!rooms[roomCode]) {
        rooms[roomCode] = {
          clients: new Set(),
          state: {}
        };
      }

      rooms[roomCode].clients.add(ws);

      console.log(`👤 User joined room: ${roomCode}`);

      // Send current state to new user
      ws.send(JSON.stringify({
        type: 'sync',
        payload: rooms[roomCode].state
      }));
    }

    // ─────────────── SYNC VIDEO ───────────────
    if (type === 'sync') {
      if (!roomCode || !rooms[roomCode]) return;

      rooms[roomCode].state = payload;

      broadcast(roomCode, {
        type: 'sync',
        payload
      }, ws);
    }

    // ─────────────── CHAT ───────────────
    if (type === 'chat') {
      if (!roomCode || !rooms[roomCode]) return;

      broadcast(roomCode, {
        type: 'chat',
        payload
      });
    }
  });

  // ─────────────── DISCONNECT ───────────────
  ws.on('close', () => {
    if (!roomCode || !rooms[roomCode]) return;

    rooms[roomCode].clients.delete(ws);

    console.log(`❌ User left room: ${roomCode}`);

    // Clean empty rooms
    if (rooms[roomCode].clients.size === 0) {
      delete rooms[roomCode];
      console.log(`🧹 Room deleted: ${roomCode}`);
    }
  });
});