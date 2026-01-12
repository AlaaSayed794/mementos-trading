require("dotenv").config();
const { Client, GatewayIntentBits } = require("discord.js");

// Create client with only Guilds intent (enough to test login)
const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.once("ready", () => {
  console.log(`✅ Bot is online! Logged in as: ${client.user.tag}`);
});
const token = process.env.DISCORD_TOKEN;
console.log(token);
// Login with your bot token from .env
client.login(token).catch((err) => {
  console.error("❌ Failed to login:", err);
});
