/**
 * Cath Watch — Shared Script
 * Sync engine: BroadcastChannel (same browser, multi-tab)
 * Fallback: localStorage polling (for cross-browser on same machine)
 */

'use strict';

// ─────────────────────────────────────────────
//  UTILS
// ─────────────────────────────────────────────

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function formatTime(sec) {
  if (!isFinite(sec) || isNaN(sec)) return '0:00';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  return `${m}:${String(s).padStart(2,'0')}`;
}

function showToast(msg, duration = 2500) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => toast.classList.remove('show'), duration);
}

function getChatKey(code) { return `cath_chat_${code}`; }
function getStateKey(code) { return `cath_state_${code}`; }
function getSessionsKey() { return 'cath_sessions'; }

function saveSessions(sessions) {
  localStorage.setItem(getSessionsKey(), JSON.stringify(sessions));
}
function loadSessions() {
  try { return JSON.parse(localStorage.getItem(getSessionsKey()) || '{}'); } catch { return {}; }
}

// ─────────────────────────────────────────────
//  BROADCAST CHANNEL
// ─────────────────────────────────────────────

let channel = null;

function openChannel(code) {
  if (channel) channel.close();
  channel = new BroadcastChannel(`cath_${code}`);
  return channel;
}

function broadcast(type, payload) {
  if (channel) channel.postMessage({ type, payload, ts: Date.now() });
}

// ─────────────────────────────────────────────
//  SESSION STATE (stored in localStorage)
// ─────────────────────────────────────────────

let sessionCode = null;
let sessionState = {};

function saveState(state) {
  if (!sessionCode) return;
  localStorage.setItem(getStateKey(sessionCode), JSON.stringify({ ...state, updated: Date.now() }));
}

function loadState(code) {
  try { return JSON.parse(localStorage.getItem(getStateKey(code)) || 'null'); } catch { return null; }
}

// ─────────────────────────────────────────────
//  CHAT
// ─────────────────────────────────────────────

let chatMessages = [];
let userName = 'User';

function saveChatMessages() {
  if (!sessionCode) return;
  localStorage.setItem(getChatKey(sessionCode), JSON.stringify(chatMessages));
}

function loadChatMessages() {
  if (!sessionCode) return [];
  try { return JSON.parse(localStorage.getItem(getChatKey(sessionCode)) || '[]'); } catch { return []; }
}

function appendChatMessage(msg, targetId) {
  const container = document.getElementById(targetId || 'chatMessages');
  if (!container) return;

  const div = document.createElement('div');
  div.className = 'chat-msg';
  div.innerHTML = `
    <div class="chat-msg-header">
      <span class="chat-msg-name ${msg.role === 'host' ? 'host-name' : ''}">${escapeHtml(msg.name)}${msg.role === 'host' ? ' 👑' : ''}</span>
      <span class="chat-msg-time">${msg.time}</span>
    </div>
    <div class="chat-msg-text">${escapeHtml(msg.text)}</div>
  `;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;

  // update badge
  updateChatBadge(chatMessages.length);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function updateChatBadge(count) {
  const badge = document.getElementById('chatBadge') || document.getElementById('wChatBadge');
  if (badge) badge.textContent = count;
}

function renderAllChatMessages(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  // Keep welcome message
  const welcome = container.querySelector('.chat-welcome');
  container.innerHTML = '';
  if (welcome) container.appendChild(welcome);
  chatMessages.forEach(m => appendChatMessage(m, containerId));
}

function sendChat(text, msgContainerId) {
  if (!text.trim()) return;
  const msg = {
    id: Date.now(),
    name: userName,
    role: window.CATH_ROLE,
    text: text.trim(),
    time: new Date().toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' }),
  };
  chatMessages.push(msg);
  saveChatMessages();
  appendChatMessage(msg, msgContainerId);
  broadcast('chat', msg);
}

// ─────────────────────────────────────────────
//  HOST MODULE
// ─────────────────────────────────────────────

function initHost() {
  // Generate session code
  sessionCode = generateCode();
  document.getElementById('sessionCodeText').textContent = sessionCode;

  // Register session
  const sessions = loadSessions();
  sessions[sessionCode] = { created: Date.now(), active: true };
  saveSessions(sessions);

  // Save initial state
  sessionState = { playing: false, currentTime: 0, videoName: null, videoSrc: null };
  saveState(sessionState);

  // Chat
  chatMessages = [];
  saveChatMessages();
  userName = 'Host';

  // Open channel
  const ch = openChannel(sessionCode);
  ch.onmessage = (e) => handleHostMessage(e.data);

  // Copy code
  document.getElementById('copyCodeBtn').addEventListener('click', () => {
    navigator.clipboard.writeText(sessionCode).then(() => showToast('Code copied! ✓'));
  });

  // Setup player
  setupHostPlayer();

  // Setup library
  setupLibrary();

  // Setup chat
  setupChat('chatInput', 'chatSendBtn', 'chatMessages');

  // Ping watchers periodically to keep watcher count
  setInterval(() => {
    broadcast('ping', { code: sessionCode });
    // Update watcher count from storage
    updateWatcherDisplay();
  }, 3000);

  // Sync state periodically
  setInterval(() => {
    const video = document.getElementById('videoPlayer');
    if (video && video.src && !video.paused) {
      sessionState.currentTime = video.currentTime;
      sessionState.playing = !video.paused;
      saveState(sessionState);
    }
  }, 2000);

  showToast(`Session created: ${sessionCode}`);
}

function updateWatcherDisplay() {
  try {
    const watchers = JSON.parse(localStorage.getItem(`cath_watchers_${sessionCode}`) || '[]');
    const now = Date.now();
    const active = watchers.filter(w => now - w.ts < 10000);
    // Save back cleaned
    localStorage.setItem(`cath_watchers_${sessionCode}`, JSON.stringify(active));
    document.getElementById('watcherNum').textContent = active.length;
  } catch {}
}

function handleHostMessage(data) {
  if (data.type === 'watcher_join') {
    const name = data.payload.name || 'Someone';
    showToast(`${name} joined the party 👋`);
    updateWatcherDisplay();
    // Send current state to new watcher
    broadcast('sync', { ...sessionState });
    // Send chat history
    broadcast('chat_history', { messages: chatMessages });
  }
  if (data.type === 'watcher_heartbeat') {
    // Watcher is alive - tracked in storage already
    updateWatcherDisplay();
  }
  if (data.type === 'chat') {
    // Watcher sent chat
    chatMessages.push(data.payload);
    saveChatMessages();
    appendChatMessage(data.payload, 'chatMessages');
    broadcast('chat', data.payload); // relay to all watchers
  }
}

function setupHostPlayer() {
  const video = document.getElementById('videoPlayer');
  const empty = document.getElementById('playerEmpty');
  const btnPP = document.getElementById('btnPlayPause');
  const btnBack = document.getElementById('btnSkipBack');
  const btnFwd = document.getElementById('btnSkipFwd');
  const timeDisp = document.getElementById('timeDisplay');
  const progressFill = document.getElementById('progressFill');
  const progressWrap = document.getElementById('progressWrap');
  const volumeSlider = document.getElementById('volumeSlider');
  const btnMute = document.getElementById('btnMute');
  const btnFS = document.getElementById('btnFullscreen');

  if (!video) return;

  video.addEventListener('play', () => {
    document.querySelector('.icon-play').style.display = 'none';
    document.querySelector('.icon-pause').style.display = '';
    sessionState.playing = true;
    sessionState.currentTime = video.currentTime;
    saveState(sessionState);
    broadcast('sync', { action: 'play', currentTime: video.currentTime });
  });

  video.addEventListener('pause', () => {
    document.querySelector('.icon-play').style.display = '';
    document.querySelector('.icon-pause').style.display = 'none';
    sessionState.playing = false;
    sessionState.currentTime = video.currentTime;
    saveState(sessionState);
    broadcast('sync', { action: 'pause', currentTime: video.currentTime });
  });

  video.addEventListener('seeked', () => {
    sessionState.currentTime = video.currentTime;
    saveState(sessionState);
    broadcast('sync', { action: 'seek', currentTime: video.currentTime, playing: !video.paused });
  });

  video.addEventListener('timeupdate', () => {
    if (!video.duration) return;
    const pct = (video.currentTime / video.duration) * 100;
    progressFill.style.width = pct + '%';
    timeDisp.textContent = `${formatTime(video.currentTime)} / ${formatTime(video.duration)}`;
  });

  btnPP.addEventListener('click', () => {
    if (video.paused) video.play();
    else video.pause();
  });

  btnBack.addEventListener('click', () => {
    video.currentTime = Math.max(0, video.currentTime - 10);
  });

  btnFwd.addEventListener('click', () => {
    video.currentTime = Math.min(video.duration || 0, video.currentTime + 10);
  });

  progressWrap.addEventListener('click', (e) => {
    if (!video.duration) return;
    const rect = progressWrap.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    video.currentTime = pct * video.duration;
  });

  volumeSlider.addEventListener('input', () => {
    video.volume = volumeSlider.value;
    video.muted = video.volume === 0;
  });

  btnMute.addEventListener('click', () => {
    video.muted = !video.muted;
    updateMuteIcon(video.muted);
  });

  btnFS.addEventListener('click', () => {
    const wrap = document.querySelector('.player-inner');
    if (document.fullscreenElement) document.exitFullscreen();
    else wrap.requestFullscreen();
  });
}

function updateMuteIcon(muted) {
  const lines = document.querySelectorAll('.vol-lines');
  lines.forEach(el => { el.style.opacity = muted ? '0.2' : '1'; });
}

// ─────────────────────────────────────────────
//  LIBRARY (MP4 + MKV SUPPORT)
// ─────────────────────────────────────────────

// Preloaded movies (from /movies folder)
const PRELOADED_MOVIES = [
  { name: "Fifty Shades", file: "movies/fifty_shades.mkv" }
];

let movieLibrary = []; // { name, filename, url }

// Init
function setupLibrary() {
  const fileInput = document.getElementById('fileInput');
  if (!fileInput) return;

  // Load default movies
  loadPreloadedMovies();

  // Keep Add Movies feature
  fileInput.addEventListener('change', (e) => {
    const files = Array.from(e.target.files);
    files.forEach(addMovieFile);
    e.target.value = '';
  });
}

// Load from /movies folder
function loadPreloadedMovies() {
  PRELOADED_MOVIES.forEach(m => {
    movieLibrary.push({
      name: m.name,
      filename: m.file,
      url: m.file
    });
  });

  renderLibrary();
}

// Add local files
function addMovieFile(file) {
  const url = URL.createObjectURL(file);
  const movie = {
    name: file.name.replace(/\.[^.]+$/, ''),
    filename: file.name,
    url
  };

  movieLibrary.push(movie);
  renderLibrary();
}

// Render UI
function renderLibrary() {
  const grid = document.getElementById('libraryGrid');
  const empty = document.getElementById('libraryEmpty');
  if (!grid) return;

  if (movieLibrary.length === 0) {
    if (empty) empty.style.display = '';
    return;
  }

  if (empty) empty.style.display = 'none';

  // Clear old cards
  Array.from(grid.children).forEach(c => {
    if (!c.id || c.id !== 'libraryEmpty') c.remove();
  });

  movieLibrary.forEach((movie, i) => {
    if (document.getElementById(`movie_${i}`)) return;

    const card = document.createElement('div');
    card.className = 'movie-card';
    card.id = `movie_${i}`;

    card.innerHTML = `
      <div class="movie-thumb">
        🎬
        <div class="movie-thumb-play">
          <svg viewBox="0 0 24 24" fill="none">
            <path d="M8 5l12 7-12 7V5z" fill="currentColor"/>
          </svg>
        </div>
      </div>
      <div class="movie-info">
        <div class="movie-title">${escapeHtml(movie.name)}</div>
        <div class="movie-meta">${getFileType(movie.filename)}</div>
      </div>
    `;

    card.addEventListener('click', () => {
      playMovie(i);
    });

    grid.appendChild(card);
  });
}

// Detect file type
function getFileType(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  if (ext === 'mp4') return 'MP4 Video';
  if (ext === 'mkv') return 'MKV Video';
  if (ext === 'webm') return 'WebM Video';
  return 'Video File';
}

// Play movie
function playMovie(index) {
  const movie = movieLibrary[index];
  if (!movie) return;

  const video = document.getElementById('videoPlayer');
  const empty = document.getElementById('playerEmpty');
  if (!video) return;

  // Highlight active
  document.querySelectorAll('.movie-card').forEach(c => c.classList.remove('active'));
  document.getElementById(`movie_${index}`)?.classList.add('active');

  video.src = movie.url;
  video.style.display = 'block';
  if (empty) empty.style.display = 'none';

  video.play().catch(err => {
    console.error(err);
    showToast("⚠️ This format may not be supported by your browser");
  });

  // Sync
  sessionState.videoName = movie.name;
  sessionState.videoSrc = movie.url;
  sessionState.currentTime = 0;
  sessionState.playing = true;
  saveState(sessionState);

  broadcast('sync', {
    action: 'load',
    videoName: movie.name,
    videoSrc: movie.url,
    currentTime: 0,
    playing: true
  });

  showToast(`▶ Now playing: ${movie.name}`);
}

// ─────────────────────────────────────────────
//  WATCHER MODULE
// ─────────────────────────────────────────────

function initWatcherJoin() {
  const codeInput = document.getElementById('codeInput');
  const nameInput = document.getElementById('nameInput');
  const joinBtn = document.getElementById('joinBtn');
  const joinError = document.getElementById('joinError');

  if (!codeInput || !joinBtn) return;

  codeInput.addEventListener('input', () => {
    codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (joinError) joinError.style.display = 'none';
  });

  codeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') joinBtn.click();
  });

  joinBtn.addEventListener('click', () => {
    const code = codeInput.value.trim().toUpperCase();
    const name = (nameInput?.value.trim() || 'Watcher');

    if (code.length !== 6) {
      showJoinError('Please enter a 6-character session code');
      return;
    }

    // Check if session exists
    const sessions = loadSessions();
    if (!sessions[code] || !sessions[code].active) {
      showJoinError('Session not found. Check the code and try again.');
      return;
    }

    joinSession(code, name);
  });

  function showJoinError(msg) {
    if (!joinError) return;
    joinError.textContent = msg;
    joinError.style.display = 'block';
  }
}

function joinSession(code, name) {
  sessionCode = code;
  userName = name || 'Watcher';

  // Hide join, show room
  document.getElementById('joinScreen').style.display = 'none';
  document.getElementById('watcherRoom').style.display = 'flex';
  document.getElementById('watcherRoom').style.flexDirection = 'column';

  // Set session display
  document.getElementById('wSessionCode').textContent = code;

  // Register watcher heartbeat
  registerWatcherHeartbeat(code, name);

  // Open channel
  const ch = openChannel(code);
  ch.onmessage = (e) => handleWatcherMessage(e.data);

  // Load existing chat
  chatMessages = loadChatMessages();
  renderAllChatMessages('wChatMessages');

  // Load existing state
  const state = loadState(code);
  if (state) applyStateToWatcher(state);

  // Announce join
  broadcast('watcher_join', { name: userName });

  // Setup watcher video controls (volume only)
  setupWatcherPlayerControls();

  // Setup chat
  setupChat('wChatInput', 'wChatSendBtn', 'wChatMessages');

  showToast(`Joined session ${code}! 🎉`);
}

function registerWatcherHeartbeat(code, name) {
  function heartbeat() {
    try {
      let watchers = JSON.parse(localStorage.getItem(`cath_watchers_${code}`) || '[]');
      const me = watchers.find(w => w.name === name);
      if (me) me.ts = Date.now();
      else watchers.push({ name, ts: Date.now() });
      localStorage.setItem(`cath_watchers_${code}`, JSON.stringify(watchers));
    } catch {}
    broadcast('watcher_heartbeat', { name });
  }
  heartbeat();
  setInterval(heartbeat, 4000);
}

function handleWatcherMessage(data) {
  if (data.type === 'sync') {
    applyStateToWatcher(data.payload);
  }
  if (data.type === 'chat') {
    const msg = data.payload;
    // Avoid duplicate
    if (!chatMessages.find(m => m.id === msg.id)) {
      chatMessages.push(msg);
      saveChatMessages();
      appendChatMessage(msg, 'wChatMessages');
    }
  }
  if (data.type === 'chat_history') {
    chatMessages = data.payload.messages;
    saveChatMessages();
    renderAllChatMessages('wChatMessages');
  }
  if (data.type === 'ping') {
    // Host is alive
  }
}

let lastAppliedSrc = null;
let isSyncing = false;

function applyStateToWatcher(state) {
  const video = document.getElementById('wVideoPlayer');
  const empty = document.getElementById('wPlayerEmpty');
  if (!video) return;

  // Update now playing
  if (state.videoName) {
    const np = document.getElementById('wNowPlaying');
    if (np) np.textContent = state.videoName;
  }

  // Update watcher count
  if (state.watcherCount !== undefined) {
    document.getElementById('wWatcherNum').textContent = state.watcherCount;
  }

  // Load new video
  if (state.videoSrc && state.videoSrc !== lastAppliedSrc) {
    lastAppliedSrc = state.videoSrc;
    video.src = state.videoSrc;
    video.style.display = 'block';
    if (empty) empty.style.display = 'none';
    video.load();
    video.addEventListener('canplay', function once() {
      video.removeEventListener('canplay', once);
      video.currentTime = state.currentTime || 0;
      if (state.playing) video.play();
    }, { once: true });
    return;
  }

  if (!video.src) return;

  // Apply action
  if (state.action === 'play' && video.paused) {
    const diff = Math.abs(video.currentTime - (state.currentTime || 0));
    if (diff > 1.5) video.currentTime = state.currentTime;
    video.play();
    setSyncIndicator('synced');
  }
  else if (state.action === 'pause') {
    video.pause();
    const diff = Math.abs(video.currentTime - (state.currentTime || 0));
    if (diff > 1) video.currentTime = state.currentTime;
    setSyncIndicator('synced');
  }
  else if (state.action === 'seek') {
    const diff = Math.abs(video.currentTime - state.currentTime);
    if (diff > 1) {
      video.currentTime = state.currentTime;
      setSyncIndicator('syncing');
      setTimeout(() => setSyncIndicator('synced'), 800);
    }
    if (state.playing && video.paused) video.play();
    else if (!state.playing && !video.paused) video.pause();
  }
  // Periodic sync check
  else if (state.playing !== undefined) {
    const diff = Math.abs(video.currentTime - (state.currentTime || 0));
    if (diff > 2.5) {
      video.currentTime = state.currentTime;
      setSyncIndicator('syncing');
      setTimeout(() => setSyncIndicator('synced'), 1000);
    }
    if (state.playing && video.paused) video.play();
    else if (!state.playing && !video.paused) video.pause();
  }
}

function setSyncIndicator(status) {
  const indicator = document.getElementById('syncIndicator');
  if (!indicator) return;
  if (status === 'synced') {
    indicator.className = 'sync-indicator';
    indicator.innerHTML = '<span class="sync-dot"></span> Synced';
  } else {
    indicator.className = 'sync-indicator syncing';
    indicator.innerHTML = '<span class="sync-dot"></span> Syncing…';
  }
}

function setupWatcherPlayerControls() {
  const video = document.getElementById('wVideoPlayer');
  const progressFill = document.getElementById('wProgressFill');
  const timeDisp = document.getElementById('wTimeDisplay');
  const volumeSlider = document.getElementById('wVolumeSlider');
  const btnMute = document.getElementById('wBtnMute');
  const btnFS = document.getElementById('wBtnFullscreen');

  if (!video) return;

  video.addEventListener('timeupdate', () => {
    if (!video.duration) return;
    const pct = (video.currentTime / video.duration) * 100;
    if (progressFill) progressFill.style.width = pct + '%';
    if (timeDisp) timeDisp.textContent = `${formatTime(video.currentTime)} / ${formatTime(video.duration)}`;
  });

  if (volumeSlider) {
    volumeSlider.addEventListener('input', () => {
      video.volume = volumeSlider.value;
      video.muted = video.volume === 0;
    });
  }

  if (btnMute) {
    btnMute.addEventListener('click', () => {
      video.muted = !video.muted;
    });
  }

  if (btnFS) {
    btnFS.addEventListener('click', () => {
      const wrap = document.querySelector('#wPlayerInner');
      if (document.fullscreenElement) document.exitFullscreen();
      else wrap.requestFullscreen();
    });
  }
}

// ─────────────────────────────────────────────
//  CHAT SETUP (shared)
// ─────────────────────────────────────────────

function setupChat(inputId, btnId, containerId) {
  const input = document.getElementById(inputId);
  const btn = document.getElementById(btnId);
  if (!input || !btn) return;

  btn.addEventListener('click', () => {
    sendChat(input.value, containerId);
    input.value = '';
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendChat(input.value, containerId);
      input.value = '';
    }
  });
}

// Override sendChat for watcher to relay through host via broadcast
const _origSendChat = sendChat;

// ─────────────────────────────────────────────
//  INIT
// ─────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  const role = window.CATH_ROLE;

  if (role === 'host') {
    initHost();
  } else if (role === 'watcher') {
    initWatcherJoin();
  }
  // Landing page needs no JS init
});
