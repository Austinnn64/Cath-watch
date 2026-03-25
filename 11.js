'use strict';

// ─────────────────────────────
// CONFIG
// ─────────────────────────────

const WS_URL = "wss://cath-watch.onrender.com";

// YOUR GOOGLE DRIVE VIDEO
const PRELOADED_MOVIES = [
  {
    name: "Fifty Shades",
    file: "https://drive.google.com/uc?export=download&id=1qhI4UISdnDu6JBfZ73j_dEDG4oMbMZ2k"
  }
];

// ─────────────────────────────
// GLOBALS
// ─────────────────────────────

let socket;
let sessionCode = null;
let movieLibrary = [];

// ─────────────────────────────
// SOCKET
// ─────────────────────────────

function connectSocket(code) {
  socket = new WebSocket(WS_URL);

  socket.onopen = () => {
    socket.send(JSON.stringify({ type: "join", code }));
  };

  socket.onmessage = (e) => {
    const data = JSON.parse(e.data);

    if (data.type === "sync") applySync(data.payload);
    if (data.type === "chat") appendChat(data.payload);
  };
}

function send(type, payload) {
  if (!socket) return;
  socket.send(JSON.stringify({ type, payload, code: sessionCode }));
}

// ─────────────────────────────
// SESSION
// ─────────────────────────────

function generateCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// ─────────────────────────────
// LIBRARY
// ─────────────────────────────

function setupLibrary() {
  const fileInput = document.getElementById("fileInput");

  PRELOADED_MOVIES.forEach(m => {
    movieLibrary.push({ name: m.name, url: m.file });
  });

  renderLibrary();

  if (fileInput) {
    fileInput.addEventListener("change", (e) => {
      Array.from(e.target.files).forEach(file => {
        movieLibrary.push({
          name: file.name,
          url: URL.createObjectURL(file)
        });
      });
      renderLibrary();
    });
  }
}

function renderLibrary() {
  const grid = document.getElementById("libraryGrid");
  const empty = document.getElementById("libraryEmpty");

  if (!grid) return;

  grid.innerHTML = "";

  if (movieLibrary.length === 0) {
    empty.style.display = "";
    return;
  }

  empty.style.display = "none";

  movieLibrary.forEach((m, i) => {
    const card = document.createElement("div");
    card.className = "movie-card";
    card.textContent = m.name;

    card.onclick = () => playMovie(i);

    grid.appendChild(card);
  });
}

// ─────────────────────────────
// PLAYER
// ─────────────────────────────

function playMovie(i) {
  const video = document.getElementById("videoPlayer");
  const m = movieLibrary[i];

  video.src = m.url;
  video.play();

  send("sync", {
    src: m.url,
    time: 0,
    playing: true
  });
}

function applySync(data) {
  const video = document.getElementById("videoPlayer");
  if (!video) return;

  if (data.src && video.src !== data.src) {
    video.src = data.src;
  }

  if (data.time !== undefined) {
    video.currentTime = data.time;
  }

  if (data.playing) video.play();
  else video.pause();
}

// ─────────────────────────────
// CHAT
// ─────────────────────────────

function setupChat() {
  const input = document.getElementById("chatInput");
  const btn = document.getElementById("chatSendBtn");

  if (!input || !btn) return;

  btn.onclick = sendChat;
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendChat();
  });
}

function sendChat() {
  const input = document.getElementById("chatInput");
  if (!input.value.trim()) return;

  const msg = {
    text: input.value,
    time: new Date().toLocaleTimeString()
  };

  appendChat(msg);
  send("chat", msg);

  input.value = "";
}

function appendChat(msg) {
  const box = document.getElementById("chatMessages");
  if (!box) return;

  const div = document.createElement("div");
  div.textContent = `[${msg.time}] ${msg.text}`;
  box.appendChild(div);
}

// ─────────────────────────────
// INIT
// ─────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
  const role = window.CATH_ROLE;

  if (role === "host") {
    sessionCode = generateCode();
    document.getElementById("sessionCodeText").textContent = sessionCode;

    connectSocket(sessionCode);
    setupLibrary();
    setupChat();
  }

  if (role === "watcher") {
    document.getElementById("joinBtn").onclick = () => {
      sessionCode = document.getElementById("codeInput").value.toUpperCase();

      connectSocket(sessionCode);
      setupChat();
    };
  }
});