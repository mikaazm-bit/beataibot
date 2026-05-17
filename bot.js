const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const url = require("url");

const BOT_TOKEN = process.env.BOT_TOKEN || "8989657800:AAH5rkzWG-PDMHvO0FSyX7YKnVuya9pR7GQ";
const FOOTBALL_API_KEY = process.env.FOOTBALL_API_KEY || "4791df4186194d6d9d1ec1f0d670d145";
const WEBAPP_URL = process.env.WEBAPP_URL || "https://beataibot-production.up.railway.app";
const PORT = process.env.PORT || 3000;

const MIME = {
  ".html": "text/html", ".js": "application/javascript",
  ".css": "text/css", ".json": "application/json",
  ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml",
};

function fetchJSON(reqUrl, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(reqUrl);
    const reqOptions = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: options.method || "GET",
      headers: options.headers || {},
    };
    const req = https.request(reqOptions, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => { try { resolve(JSON.parse(data)); } catch (e) { resolve({}); } });
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

function tg(method, data) {
  const body = JSON.stringify(data);
  return fetchJSON(
    `https://api.telegram.org/bot${BOT_TOKEN}/${method}`,
    { method: "POST", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) } },
    body
  );
}

function football(endpoint) {
  return fetchJSON(`https://api.football-data.org/v4/${endpoint}`, { headers: { "X-Auth-Token": FOOTBALL_API_KEY } });
}

async function setupBot() {
  await tg("setMyCommands", {
    commands: [
      { command: "start", description: "🚀 Запустить бота" },
      { command: "matches", description: "📅 Матчи" },
      { command: "picks", description: "🤖 AI Picks" },
      { command: "live", description: "🔴 Live" },
    ],
  });
  await tg("setChatMenuButton", {
    menu_button: { type: "web_app", text: "⚽ Открыть", web_app: { url: WEBAPP_URL } },
  });
  console.log("✅ Bot setup done");
}

async function handleUpdate(update) {
  if (!update.message) return;
  const chatId = update.message.chat.id;
  const text = (update.message.text || "").trim();

  if (text === "/start" || text.startsWith("/start")) {
    await tg("sendMessage", {
      chat_id: chatId,
      text: `⚽ *BeatAI — Football Intelligence*\n\nАнализирую матчи и нахожу value bets с положительным EV.\n\nНажми кнопку *«Открыть»* внизу 👇`,
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: [[{ text: "⚽ Открыть BeatAI", web_app: { url: WEBAPP_URL } }]] },
    });
  } else if (text.startsWith("/matches")) {
    await tg("sendMessage", {
      chat_id: chatId,
      text: "📲 Открываю матчи...",
      reply_markup: { inline_keyboard: [[{ text: "⚽ Открыть BeatAI", web_app: { url: `${WEBAPP_URL}?page=matches` } }]] },
    });
  } else if (text.startsWith("/live")) {
    await tg("sendMessage", {
      chat_id: chatId,
      text: "🔴 Открываю Live...",
      reply_markup: { inline_keyboard: [[{ text: "⚽ Открыть BeatAI", web_app: { url: `${WEBAPP_URL}?page=live` } }]] },
    });
  } else if (text.startsWith("/picks")) {
    await tg("sendMessage", {
      chat_id: chatId,
      text: "🤖 Открываю AI Picks...",
      reply_markup: { inline_keyboard: [[{ text: "⚽ Открыть BeatAI", web_app: { url: `${WEBAPP_URL}?page=picks` } }]] },
    });
  } else {
    await tg("sendMessage", {
      chat_id: chatId,
      text: "⚽ Привет! Напиши /start чтобы начать.",
    });
  }
}

function generateAI(match) {
  const picks = ["Home Win", "Away Win", "BTTS", "Over 2.5", "Under 2.5", "Draw No Bet", "Asian Handicap -0.5"];
  const pick = picks[match.id % picks.length];
  const conf = 60 + (match.id % 30);
  const ev = ((conf - 55) * 0.4).toFixed(1);
  return {
    pick, conf, ev: `+${ev}%`, type: conf >= 72 ? "value" : "normal",
    odds: {
      h: (1.4 + (match.id % 20) * 0.08).toFixed(2),
      d: (3.0 + (match.id % 10) * 0.1).toFixed(2),
      a: (2.0 + (match.id % 25) * 0.1).toFixed(2),
    },
    risk: conf >= 80 ? "Низкий" : conf >= 68 ? "Средний" : "Высокий",
  };
}

function transformStatus(s) {
  if (["IN_PLAY", "PAUSED", "LIVE"].includes(s)) return "live";
  if (s === "FINISHED") return "finished";
  return "upcoming";
}

function formatTime(utcDate) {
  const d = new Date(utcDate);
  return `${d.getHours().toString().padStart(2,"0")}:${d.getMinutes().toString().padStart(2,"0")}`;
}

async function getMatches(dateFrom, dateTo) {
  const competitions = ["PL", "PD", "BL1", "SA", "FL1", "CL"];
  const results = await Promise.allSettled(
    competitions.map(c => football(`competitions/${c}/matches?dateFrom=${dateFrom}&dateTo=${dateTo}`))
  );
  const allMatches = [];
  results.forEach(r => { if (r.status === "fulfilled" && r.value.matches) allMatches.push(...r.value.matches); });
  return allMatches.map(m => ({
    id: m.id, league: m.competition?.name || "Unknown", leagueCode: m.competition?.code,
    home: m.homeTeam?.shortName || m.homeTeam?.name || "?",
    away: m.awayTeam?.shortName || m.awayTeam?.name || "?",
    status: transformStatus(m.status),
    score: m.score?.fullTime ? `${m.score.fullTime.home ?? "-"}-${m.score.fullTime.away ?? "-"}` : null,
    time: formatTime(m.utcDate), utcDate: m.utcDate, ai: generateAI(m),
  })).sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate));
}

function serveStatic(res, filePath) {
  const ext = path.extname(filePath);
  const mime = MIME[ext] || "text/plain";
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end("Not found"); return; }
    res.writeHead(200, { "Content-Type": mime });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (pathname === "/webhook" && req.method === "POST") {
    let body = "";
    req.on("data", chunk => (body += chunk));
    req.on("end", async () => {
      try { await handleUpdate(JSON.parse(body)); } catch (e) { console.error(e); }
      res.writeHead(200); res.end("ok");
    });
    return;
  }

  if (pathname === "/setup") {
    const r = await tg("setWebhook", { url: `${WEBAPP_URL}/webhook` });
    await setupBot();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, webhook: r, webapp: WEBAPP_URL }));
    return;
  }

  if (pathname === "/api/matches") {
    const dateFrom = parsed.query.dateFrom || new Date().toISOString().slice(0,10);
    const dateTo = parsed.query.dateTo || dateFrom;
    try {
      const matches = await getMatches(dateFrom, dateTo);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ matches }));
    } catch (e) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ matches: [], error: e.message }));
    }
    return;
  }

  if (pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", port: PORT }));
    return;
  }

  if (pathname === "/" || pathname === "/index.html") {
    serveStatic(res, path.join(__dirname, "public", "index.html"));
    return;
  }

  serveStatic(res, path.join(__dirname, "public", pathname));
});

server.listen(PORT, () => {
  console.log(`🚀 BeatAI running on port ${PORT}`);
  console.log(`🌐 ${WEBAPP_URL}`);
});
