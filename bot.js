const express = require("express");
const path = require("path");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const BOT_TOKEN = process.env.BOT_TOKEN || "8989657800:AAH5rkzWG-PDMHvO0FSyX7YKnVuya9pR7GQ";
const FOOTBALL_API_KEY = process.env.FOOTBALL_API_KEY || "4791df4186194d6d9d1ec1f0d670d145";
const WEBAPP_URL = process.env.WEBAPP_URL || "https://your-app.railway.app";

// ─── Telegram Bot API helper ───────────────────────────────────────────────
async function tg(method, body) {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

// ─── Football Data API helper ──────────────────────────────────────────────
async function football(endpoint) {
  const res = await fetch(`https://api.football-data.org/v4/${endpoint}`, {
    headers: { "X-Auth-Token": FOOTBALL_API_KEY },
  });
  return res.json();
}

// ─── Set bot commands ──────────────────────────────────────────────────────
async function setupBot() {
  await tg("setMyCommands", {
    commands: [
      { command: "start",   description: "🚀 Запустить бота" },
      { command: "matches", description: "📅 Матчи сегодня" },
      { command: "picks",   description: "🤖 AI Picks" },
      { command: "live",    description: "🔴 Live матчи" },
    ],
  });

  // Set Web App button in menu
  await tg("setChatMenuButton", {
    menu_button: {
      type: "web_app",
      text: "⚽ Открыть",
      web_app: { url: WEBAPP_URL },
    },
  });

  console.log("✅ Bot commands set");
}

// ─── Webhook handler ───────────────────────────────────────────────────────
app.post("/webhook", async (req, res) => {
  res.sendStatus(200);
  const update = req.body;
  if (!update.message) return;

  const chatId = update.message.chat.id;
  const text   = update.message.text || "";

  if (text === "/start") {
    await tg("sendMessage", {
      chat_id: chatId,
      text: `⚽ *BeatAI — Football Intelligence*\n\nПривет! Я анализирую футбольные матчи и нахожу value bets с положительным EV.\n\n📊 Нажми кнопку *«Открыть»* внизу чтобы открыть полный интерфейс.\n\nИли используй команды:\n/matches — матчи сегодня\n/live — live матчи\n/picks — лучшие AI ставки`,
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [[{
          text: "⚽ Открыть BeatAI",
          web_app: { url: WEBAPP_URL },
        }]],
      },
    });
    return;
  }

  if (text === "/matches" || text === "/live" || text === "/picks") {
    let page = "matches";
    if (text === "/live")  page = "live";
    if (text === "/picks") page = "picks";

    await tg("sendMessage", {
      chat_id: chatId,
      text: `📲 Открываю раздел...`,
      reply_markup: {
        inline_keyboard: [[{
          text: "⚽ Открыть BeatAI",
          web_app: { url: `${WEBAPP_URL}?page=${page}` },
        }]],
      },
    });
  }
});

// ─── API: fetch today's matches from football-data.org ────────────────────
app.get("/api/matches", async (req, res) => {
  try {
    const dateFrom = req.query.dateFrom;
    const dateTo   = req.query.dateTo;

    // Fetch from multiple competitions (free tier supports these)
    const competitions = ["PL", "PD", "BL1", "SA", "FL1", "CL"];
    const results = await Promise.allSettled(
      competitions.map(c =>
        football(`competitions/${c}/matches?dateFrom=${dateFrom}&dateTo=${dateTo}&status=SCHEDULED,LIVE,IN_PLAY,PAUSED,FINISHED`)
      )
    );

    const allMatches = [];
    results.forEach(r => {
      if (r.status === "fulfilled" && r.value.matches) {
        allMatches.push(...r.value.matches);
      }
    });

    // Transform + add AI predictions
    const matches = allMatches.map(m => ({
      id: m.id,
      league: m.competition?.name || "Unknown",
      leagueCode: m.competition?.code,
      home: m.homeTeam?.shortName || m.homeTeam?.name || "?",
      away: m.awayTeam?.shortName || m.awayTeam?.name || "?",
      homeFull: m.homeTeam?.name,
      awayFull: m.awayTeam?.name,
      status: transformStatus(m.status),
      score: m.score?.fullTime ? `${m.score.fullTime.home ?? "-"}-${m.score.fullTime.away ?? "-"}` : null,
      time: formatTime(m.utcDate),
      utcDate: m.utcDate,
      ai: generateAIPrediction(m),
    }));

    // Sort by time
    matches.sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate));

    res.json({ matches });
  } catch (e) {
    console.error(e);
    res.json({ matches: [], error: e.message });
  }
});

// ─── Helpers ───────────────────────────────────────────────────────────────
function transformStatus(s) {
  if (["IN_PLAY", "PAUSED", "LIVE"].includes(s)) return "live";
  if (s === "FINISHED") return "finished";
  return "upcoming";
}

function formatTime(utcDate) {
  const d = new Date(utcDate);
  const h = d.getHours().toString().padStart(2, "0");
  const m = d.getMinutes().toString().padStart(2, "0");
  return `${h}:${m}`;
}

// Simple AI prediction generator based on available data
function generateAIPrediction(match) {
  // In production: replace with real ML model / Claude API
  const picks = ["Home Win", "Away Win", "Draw No Bet", "BTTS", "Over 2.5", "Under 2.5", "Asian Handicap -0.5"];
  const pick  = picks[match.id % picks.length];
  const conf  = 60 + (match.id % 30);
  const ev    = ((conf - 55) * 0.4).toFixed(1);
  const odds  = {
    h: (1.4 + (match.id % 20) * 0.08).toFixed(2),
    d: (3.0 + (match.id % 10) * 0.1).toFixed(2),
    a: (2.0 + (match.id % 25) * 0.1).toFixed(2),
  };
  return {
    pick,
    conf,
    ev: `+${ev}%`,
    type: conf >= 72 ? "value" : "normal",
    odds,
    risk: conf >= 80 ? "Низкий" : conf >= 68 ? "Средний" : "Высокий",
  };
}

// ─── Health check ──────────────────────────────────────────────────────────
app.get("/", (req, res) => res.send("⚽ BeatAI Bot is running!"));
app.get("/health", (req, res) => res.json({ status: "ok" }));

// ─── Register webhook with Telegram ───────────────────────────────────────
app.get("/setup", async (req, res) => {
  const url = `${WEBAPP_URL}/webhook`;
  const r = await tg("setWebhook", { url });
  await setupBot();
  res.json({ webhook: r, webapp: WEBAPP_URL });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`🚀 BeatAI running on port ${PORT}`);
  console.log(`🌐 WebApp URL: ${WEBAPP_URL}`);
});
