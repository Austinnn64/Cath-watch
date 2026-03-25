const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: 8080 });

let rooms = {}; // roomCode -> { state, clients }

wss.on('connection', (ws) => {
  let roomCode = null;

  ws.on('message', (msg) => {
    const data = JSON.parse(msg);

    if (data.type === 'join') {
      roomCode = data.code;

      if (!rooms[roomCode]) {
        rooms[roomCode] = { clients: [], state: {} };
      }

      rooms[roomCode].clients.push(ws);

      // Send current state
      ws.send(JSON.stringify({
        type: 'sync',
        payload: rooms[roomCode].state
      }));
    }

    if (data.type === 'sync') {
      if (!roomCode) return;

      rooms[roomCode].state = data.payload;

      // Broadcast to everyone
      rooms[roomCode].clients.forEach(client => {
        if (client !== ws && client.readyState === 1) {
          client.send(JSON.stringify({
            type: 'sync',
            payload: data.payload
          }));
        }
      });
    }

    if (data.type === 'chat') {
      rooms[roomCode].clients.forEach(client => {
        if (client.readyState === 1) {
          client.send(JSON.stringify({
            type: 'chat',
            payload: data.payload
          }));
        }
      });
    }
  });

  ws.on('close', () => {
    if (!roomCode || !rooms[roomCode]) return;
    rooms[roomCode].clients =
      rooms[roomCode].clients.filter(c => c !== ws);
  });
});

console.log("WebSocket server running on port 8080");