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
