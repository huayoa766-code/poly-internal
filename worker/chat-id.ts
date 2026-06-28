import "dotenv/config";

async function main() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.log("No TELEGRAM_BOT_TOKEN in .env");
    process.exit(1);
  }
  const res = await fetch(`https://api.telegram.org/bot${token}/getUpdates`);
  const data = (await res.json()) as {
    ok: boolean;
    result: Array<{ message?: { chat?: { id: number; type: string; username?: string; first_name?: string } } }>;
  };
  if (!data.ok) {
    console.log("getUpdates failed:", JSON.stringify(data));
    process.exit(1);
  }
  const chats = new Map<number, string>();
  for (const u of data.result) {
    const c = u.message?.chat;
    if (c) chats.set(c.id, `${c.type} ${c.username ?? c.first_name ?? ""}`.trim());
  }
  if (chats.size === 0) {
    console.log("No chats found. Open your bot in Telegram and send it a message (e.g. 'hi'), then re-run.");
  } else {
    console.log("Found chats — put the id in .env as TELEGRAM_CHAT_ID:");
    for (const [id, label] of chats) console.log(`  ${id}  (${label})`);
  }
  process.exit(0);
}
main().catch((e) => {
  console.error("ERR:", e.message);
  process.exit(1);
});
