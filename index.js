const fs = require("fs");
const { Client, GatewayIntentBits } = require("discord.js");
const config = {
  token: process.env.DISCORD_TOKEN,
  guildId: process.env.GUILD_ID,
  requestsChannelId: process.env.REQUESTS_CHANNEL_ID,
  duplicatesChannelId: process.env.DUPLICATES_CHANNEL_ID,
  autoMatchChannelId: process.env.MATCHES_CHANNEL_ID,
};

const items = require("./items.json").items;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
});

// Load or initialize users storage
let users = {};
if (fs.existsSync("./users.json")) {
  users = JSON.parse(fs.readFileSync("./users.json"));
}

function saveUsers() {
  fs.writeFileSync("./users.json", JSON.stringify(users, null, 2));
}

// Parse items from a message, matching allowed items
function parseItems(text) {
  return items.filter((item) =>
    text.toUpperCase().includes(item.toUpperCase())
  );
}

// Two-way matching: only returns matches where both users can trade
function findMatches() {
  const results = [];
  const userIds = Object.keys(users);

  for (let i = 0; i < userIds.length; i++) {
    const aId = userIds[i];
    const a = users[aId];
    if (!a.duplicates || !a.requests) continue;

    for (let j = i + 1; j < userIds.length; j++) {
      const bId = userIds[j];
      const b = users[bId];
      if (!b.duplicates || !b.requests) continue;

      const aNeeds = a.requests.filter((req) => b.duplicates.includes(req));
      const bNeeds = b.requests.filter((req) => a.duplicates.includes(req));

      // Only consider two-way trades
      if (aNeeds.length > 0 && bNeeds.length > 0) {
        results.push({ aId, bId, aNeeds, bNeeds });
      }
    }
  }

  return results;
}

// Listen for messages in Requests / Duplicates channels
client.on("messageCreate", async (msg) => {
  if (msg.author.bot) return;

  let updated = false;
  const channelId = msg.channel.id;

  if (channelId === config.duplicatesChannelId) {
    const found = parseItems(msg.content);
    users[msg.author.id] = users[msg.author.id] || {
      requests: [],
      duplicates: [],
    };
    users[msg.author.id].duplicates = found;
    updated = true;
    msg.reply(
      `✅ Your **duplicates** list has been saved: ${found.join(", ")}`
    );
  }

  if (channelId === config.requestsChannelId) {
    const found = parseItems(msg.content);
    users[msg.author.id] = users[msg.author.id] || {
      requests: [],
      duplicates: [],
    };
    users[msg.author.id].requests = found;
    updated = true;
    msg.reply(`✅ Your **requests** list has been saved: ${found.join(", ")}`);
  }

  if (updated) {
    saveUsers();
    triggerMatches(msg.author.id);
  }
});

// Trigger matches for a specific user
async function triggerMatches(userId) {
  const matches = findMatches();
  if (matches.length === 0) return;

  const matchChannel = await client.channels
    .fetch(config.autoMatchChannelId)
    .catch(() => null);

  for (const m of matches) {
    const userA = await client.users.fetch(m.aId).catch(() => null);
    const userB = await client.users.fetch(m.bId).catch(() => null);

    if (!userA || !userB) continue;

    const dmA = `🔔 Match Found!\nYou can get from **${
      userB.tag
    }**: ${m.aNeeds.join(", ")}\nYou can give: ${m.bNeeds.join(", ")}`;
    const dmB = `🔔 Match Found!\nYou can get from **${
      userA.tag
    }**: ${m.bNeeds.join(", ")}\nYou can give: ${m.aNeeds.join(", ")}`;

    // Send DMs
    userA.send(dmA).catch(() => console.log(`Could not DM ${userA.tag}`));
    userB.send(dmB).catch(() => console.log(`Could not DM ${userB.tag}`));

    // Post in match channel if available
    if (matchChannel && matchChannel.isTextBased && matchChannel.guild) {
      matchChannel
        .send(
          `🔗 **New Match!** <@${m.aId}> ↔ <@${m.bId}>\n` +
            `They can give <@${m.aId}>: ${m.aNeeds.join(", ")}\n` +
            `They can give <@${m.bId}>: ${m.bNeeds.join(", ")}`
        )
        .catch(() => console.log("Could not post match in channel"));
    }
  }
}

client.once("clientReady", () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.login(config.token);
