/**
 * Urban Quest API
 * Простой сервер: пользователи, лобби, прогресс, результаты всех команд.
 * Данные хранятся в data.json (на Render — эфемерно; для продакшена лучше БД).
 */

const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, "data.json");
const ADMIN_KEY = process.env.ADMIN_KEY || "ltk-admin-2026";

app.use(cors());
app.use(express.json({ limit: "1mb" }));

// ---------- storage ----------
function load() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    }
  } catch (e) {
    console.error("load error", e.message);
  }
  return { users: [], lobbies: [] };
}

function save(db) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2), "utf8");
}

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function genCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// ---------- health ----------
app.get("/", (req, res) => {
  res.json({
    ok: true,
    name: "Urban Quest API",
    endpoints: [
      "POST /api/register",
      "POST /api/login",
      "GET  /api/lobbies",
      "POST /api/lobbies",
      "POST /api/lobbies/join",
      "GET  /api/lobbies/:id",
      "PATCH /api/lobbies/:id",
      "POST /api/lobbies/:id/progress",
      "POST /api/lobbies/:id/finish",
      "GET  /api/results",
      "GET  /api/admin/results?key=ADMIN_KEY",
    ],
  });
});

// ---------- auth ----------
app.post("/api/register", (req, res) => {
  const { username, password } = req.body || {};
  if (!username || username.length < 3) {
    return res.status(400).json({ error: "Логин от 3 символов" });
  }
  if (!password || password.length < 4) {
    return res.status(400).json({ error: "Пароль от 4 символов" });
  }
  const db = load();
  if (db.users.find((u) => u.username.toLowerCase() === username.toLowerCase())) {
    return res.status(400).json({ error: "Такой пользователь уже есть" });
  }
  const user = { id: uid(), username, password, createdAt: new Date().toISOString() };
  db.users.push(user);
  save(db);
  res.json({ id: user.id, username: user.username });
});

app.post("/api/login", (req, res) => {
  const { username, password } = req.body || {};
  const db = load();
  const user = db.users.find(
    (u) => u.username.toLowerCase() === String(username || "").toLowerCase() && u.password === password
  );
  if (!user) return res.status(401).json({ error: "Неверный логин или пароль" });
  res.json({ id: user.id, username: user.username });
});

// ---------- lobbies ----------
app.get("/api/lobbies", (req, res) => {
  const db = load();
  const list = db.lobbies
    .filter((l) => l.status === "waiting" || l.status === "playing")
    .map(publicLobby);
  res.json(list);
});

app.post("/api/lobbies", (req, res) => {
  const { questId, questTitle, hostId, hostUsername, maxPlayers } = req.body || {};
  if (!questId || !hostId || !hostUsername) {
    return res.status(400).json({ error: "Нужны questId, hostId, hostUsername" });
  }
  const db = load();
  const lobby = {
    id: uid(),
    code: genCode(),
    questId,
    questTitle: questTitle || questId,
    hostId,
    host: hostUsername,
    maxPlayers: maxPlayers || 6,
    status: "waiting",
    players: [
      {
        id: hostId,
        username: hostUsername,
        ready: false,
        score: 0,
        completedTasks: [],
        wrongAttempts: {},
      },
    ],
    createdAt: new Date().toISOString(),
    startedAt: null,
    finishedAt: null,
  };
  db.lobbies.push(lobby);
  save(db);
  res.json(publicLobby(lobby));
});

app.post("/api/lobbies/join", (req, res) => {
  const { code, userId, username } = req.body || {};
  if (!code || !userId || !username) {
    return res.status(400).json({ error: "Нужны code, userId, username" });
  }
  const db = load();
  const lobby = db.lobbies.find(
    (l) => l.code === String(code).toUpperCase() && l.status === "waiting"
  );
  if (!lobby) return res.status(404).json({ error: "Лобби не найдено или уже началось" });
  if (lobby.players.length >= lobby.maxPlayers) {
    return res.status(400).json({ error: "Лобби заполнено" });
  }
  if (!lobby.players.find((p) => p.id === userId)) {
    lobby.players.push({
      id: userId,
      username,
      ready: false,
      score: 0,
      completedTasks: [],
      wrongAttempts: {},
    });
    save(db);
  }
  res.json(publicLobby(lobby));
});

app.get("/api/lobbies/:id", (req, res) => {
  const db = load();
  const lobby = db.lobbies.find((l) => l.id === req.params.id);
  if (!lobby) return res.status(404).json({ error: "Не найдено" });
  res.json(publicLobby(lobby));
});

// ready / start
app.patch("/api/lobbies/:id", (req, res) => {
  const db = load();
  const lobby = db.lobbies.find((l) => l.id === req.params.id);
  if (!lobby) return res.status(404).json({ error: "Не найдено" });

  const { userId, ready, start } = req.body || {};

  if (typeof ready === "boolean" && userId) {
    const p = lobby.players.find((x) => x.id === userId);
    if (p) p.ready = ready;
  }

  if (start && userId === lobby.hostId && lobby.status === "waiting") {
    lobby.status = "playing";
    lobby.startedAt = new Date().toISOString();
  }

  save(db);
  res.json(publicLobby(lobby));
});

// progress: score, completed tasks, wrongs
app.post("/api/lobbies/:id/progress", (req, res) => {
  const db = load();
  const lobby = db.lobbies.find((l) => l.id === req.params.id);
  if (!lobby) return res.status(404).json({ error: "Не найдено" });

  const { userId, score, completedTasks, wrongAttempts } = req.body || {};
  const p = lobby.players.find((x) => x.id === userId);
  if (!p) return res.status(404).json({ error: "Игрок не в лобби" });

  if (typeof score === "number") p.score = score;
  if (Array.isArray(completedTasks)) p.completedTasks = completedTasks;
  if (wrongAttempts && typeof wrongAttempts === "object") p.wrongAttempts = wrongAttempts;

  save(db);
  res.json(publicLobby(lobby));
});

app.post("/api/lobbies/:id/finish", (req, res) => {
  const db = load();
  const lobby = db.lobbies.find((l) => l.id === req.params.id);
  if (!lobby) return res.status(404).json({ error: "Не найдено" });
  lobby.status = "finished";
  lobby.finishedAt = new Date().toISOString();
  save(db);
  res.json(publicLobby(lobby));
});

// ---------- results (all teams) ----------
app.get("/api/results", (req, res) => {
  const db = load();
  const list = db.lobbies
    .filter((l) => l.status === "finished" || l.status === "playing")
    .map(resultSummary)
    .sort((a, b) => (b.startedAt || "").localeCompare(a.startedAt || ""));
  res.json(list);
});

// admin full dump
app.get("/api/admin/results", (req, res) => {
  if (req.query.key !== ADMIN_KEY) {
    return res.status(403).json({ error: "Неверный ADMIN_KEY" });
  }
  const db = load();
  res.json({
    usersCount: db.users.length,
    lobbies: db.lobbies.map(publicLobby),
  });
});

function publicLobby(l) {
  return {
    id: l.id,
    code: l.code,
    questId: l.questId,
    questTitle: l.questTitle,
    hostId: l.hostId,
    host: l.host,
    maxPlayers: l.maxPlayers,
    status: l.status,
    players: l.players,
    createdAt: l.createdAt,
    startedAt: l.startedAt,
    finishedAt: l.finishedAt || null,
  };
}

function resultSummary(l) {
  const players = (l.players || [])
    .slice()
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .map((p) => ({
      username: p.username,
      score: p.score || 0,
      completedTasks: (p.completedTasks || []).length,
      wrongs: sumWrongs(p.wrongAttempts),
    }));
  const teamScore = players.reduce((s, p) => s + p.score, 0);
  return {
    id: l.id,
    code: l.code,
    questTitle: l.questTitle,
    status: l.status,
    host: l.host,
    startedAt: l.startedAt,
    finishedAt: l.finishedAt || null,
    teamScore,
    players,
  };
}

function sumWrongs(wa) {
  if (!wa) return 0;
  let n = 0;
  for (const k of Object.keys(wa)) n += wa[k] || 0;
  return n;
}

// serve static frontend if present
const publicDir = path.join(__dirname, "public");
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
}

app.listen(PORT, () => {
  console.log(`Urban Quest API → http://localhost:${PORT}`);
  console.log(`ADMIN_KEY = ${ADMIN_KEY}`);
});
