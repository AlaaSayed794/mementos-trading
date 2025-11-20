const fs = require("fs");
const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
} = require("discord.js");

// Config from environment variables
const config = {
  token: process.env.DISCORD_TOKEN,
  guildId: process.env.GUILD_ID,
  requestsChannelId: process.env.REQUESTS_CHANNEL_ID,
  duplicatesChannelId: process.env.DUPLICATES_CHANNEL_ID,
  autoMatchChannelId: process.env.MATCHES_CHANNEL_ID,
  listManagementChannelId: process.env.LIST_MANAGEMENT_CHANNEL_ID,
};

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
});

// Items list
const items = [
  "BATCAVE ACCESS CARD",
  "RA'S AL GHUL'S LAZARUS PIT",
  "ANKH AMULET",
  "MANACLES OF FORCE",
  "POWER GLOVE",
  "THE MERCILESS",
  "THE DROWNED",
  "CLEANING SUPPLIES",
  "THE PENGUIN'S UMBRELLA",
  "HARVEY DENT'S COURT TRANSCRIPTS",
  "THE RIDDLER'S PUZZLE SIMULATOR",
  "MAGGIE KYLE'S TREATMENT PLAN",
  "ALFRED'S CONTENGENCY PLANS",
  "DAMIAN WAYNE'S GENETIC CODE",
  "JASON TODD'S RESOURCE PACKAGE",
  "PROTOTYPE BATRANG",
  "GORDON'S POLICE BADGE",
  "HELMET OF FATE",
  "SEAL OF CLARITY",
  "TRIDENT OF NEPTUNE",
  "TEAR OF EXTUNCTION",
  "THE DEVASTATOR",
  "RED DEATH",
  "THE BATMAN WHO LAUGHS",
  "MAP OF THE DARK MULTIVERSE",
  "BARBATOS",
  "LIQUID NITROGEN TANK",
  "PSYCHIATRIC NOTES",
  "SILPHIUM SEEDS",
  "THE JOKER FISH",
  "TALON MASK",
  "CYBERNETIC NERVE IMPLANT",
  "COLD CASE LIBRARY",
  "JASON TODD'S ROBIN COSTUME",
  "CATWOMAN'S ENGAGEMENT RING",
  "ARKHAM ASYLUM KEY",
  "THE JOKER'S TOXIN VIAL",
];

// Load or initialize users.json
let users = {};
if (fs.existsSync("./users.json")) {
  users = JSON.parse(fs.readFileSync("./users.json"));
}
function saveUsers() {
  fs.writeFileSync("./users.json", JSON.stringify(users, null, 2));
}

// Parse numbers from input (space/comma separated)
function parseNumbers(input) {
  return input
    .split(/[ ,]+/)
    .map((x) => parseInt(x))
    .filter((x) => !isNaN(x) && x >= 1 && x <= items.length)
    .map((x) => x - 1); // convert to 0-index
}

// Add items to user list
function addItems(user, type, indices) {
  users[user.id] = users[user.id] || { requests: [], duplicates: [] };
  const list = users[user.id][type];

  const added = [];
  const already = [];

  indices.forEach((i) => {
    if (!list.includes(items[i])) {
      list.push(items[i]);
      added.push(items[i]);
    } else {
      already.push(items[i]);
    }
  });

  saveUsers();
  return { added, already };
}

// Remove items from user list
function removeItems(user, type, indices) {
  users[user.id] = users[user.id] || { requests: [], duplicates: [] };
  const list = users[user.id][type];

  const removed = [];
  const notFound = [];

  indices.forEach((i) => {
    if (list.includes(items[i])) {
      list.splice(list.indexOf(items[i]), 1);
      removed.push(items[i]);
    } else {
      notFound.push(items[i]);
    }
  });

  saveUsers();
  return { removed, notFound };
}

// View user's lists with original item numbers
function viewLists(user) {
  users[user.id] = users[user.id] || { requests: [], duplicates: [] };
  const { requests, duplicates } = users[user.id];

  const formatList = (arr) =>
    arr
      .map((item) => {
        const idx = items.indexOf(item);
        return idx !== -1 ? `${idx + 1}. ${item}` : item;
      })
      .join("\n") || "None";

  return `**Your Requests:**\n${formatList(
    requests
  )}\n\n**Your Duplicates:**\n${formatList(duplicates)}`;
}

// Two-way matching
function findMatches() {
  const results = [];
  const userIds = Object.keys(users);

  for (let i = 0; i < userIds.length; i++) {
    const aId = userIds[i];
    const a = users[aId];
    if (!a.requests || !a.duplicates) continue;

    for (let j = i + 1; j < userIds.length; j++) {
      const bId = userIds[j];
      const b = users[bId];
      if (!b.requests || !b.duplicates) continue;

      const aNeeds = a.requests.filter((req) => b.duplicates.includes(req));
      const bNeeds = b.requests.filter((req) => a.duplicates.includes(req));

      if (aNeeds.length > 0 && bNeeds.length > 0) {
        results.push({ aId, bId, aNeeds, bNeeds });
      }
    }
  }

  return results;
}

// Trigger matches
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

    userA.send(dmA).catch(() => console.log(`Could not DM ${userA.tag}`));
    userB.send(dmB).catch(() => console.log(`Could not DM ${userB.tag}`));

    if (matchChannel && matchChannel.isTextBased && matchChannel.guild) {
      matchChannel
        .send(
          `🔗 **New Match!** <@${m.aId}> ↔ <@${m.bId}>\n` +
            `<@${m.aId}> can get: ${m.aNeeds.join(", ")}\n` +
            `<@${m.bId}> can get: ${m.bNeeds.join(", ")}`
        )
        .catch(() => console.log("Could not post match in channel"));
    }
  }
}

// Slash commands
const commands = [
  new SlashCommandBuilder()
    .setName("addrequest")
    .setDescription("Add items to your requests")
    .addStringOption((opt) =>
      opt
        .setName("items")
        .setDescription("Numbers separated by space or comma")
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("addduplicate")
    .setDescription("Add items to your duplicates")
    .addStringOption((opt) =>
      opt
        .setName("items")
        .setDescription("Numbers separated by space or comma")
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("removerequest")
    .setDescription("Remove items from your requests")
    .addStringOption((opt) =>
      opt
        .setName("items")
        .setDescription("Numbers separated by space or comma")
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("removeduplicate")
    .setDescription("Remove items from your duplicates")
    .addStringOption((opt) =>
      opt
        .setName("items")
        .setDescription("Numbers separated by space or comma")
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("viewmylists")
    .setDescription("View your requests and duplicates"),
].map((cmd) => cmd.toJSON());

const rest = new REST({ version: "10" }).setToken(config.token);

// Enforce slash commands only in requests/duplicates channels
client.on("messageCreate", async (msg) => {
  if (msg.author.bot) return;

  if (
    [config.requestsChannelId, config.duplicatesChannelId].includes(
      msg.channel.id
    )
  ) {
    if (!msg.content.startsWith("/")) {
      await msg.delete().catch(() => {});
      msg.author
        .send(`❌ Please only use slash commands in #${msg.channel.name}`)
        .catch(() => {});
    }
  }
});

// Register commands after ready
client.once("clientReady", async () => {
  console.log(`Logged in as ${client.user.tag}`);
  try {
    await rest.put(
      Routes.applicationGuildCommands(client.user.id, config.guildId),
      { body: commands }
    );
    console.log("Slash commands registered.");
  } catch (err) {
    console.error("Error registering commands:", err);
  }
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const user = interaction.user;
  const cmd = interaction.commandName;
  const raw = interaction.options.getString("items");
  const indices = raw ? parseNumbers(raw) : [];

  let type, allowedChannel;

  switch (cmd) {
    case "addrequest":
      type = "requests";
      allowedChannel = config.requestsChannelId;
      break;
    case "addduplicate":
      type = "duplicates";
      allowedChannel = config.duplicatesChannelId;
      break;
    case "removerequest":
      type = "requests";
      allowedChannel = config.listManagementChannelId;
      break;
    case "removeduplicate":
      type = "duplicates";
      allowedChannel = config.listManagementChannelId;
      break;
    case "viewmylists":
      if (interaction.channel.id !== config.listManagementChannelId) {
        return interaction.reply({
          content: `❌ This command can only be used in the list-management channel.`,
          ephemeral: true,
        });
      }
      return interaction.reply({ content: viewLists(user), ephemeral: true });
    default:
      return;
  }

  if (interaction.channel.id !== allowedChannel) {
    return interaction.reply({
      content: `❌ This command cannot be used in this channel.`,
      ephemeral: true,
    });
  }

  if (cmd.startsWith("add")) {
    if (indices.length === 0)
      return interaction.reply({
        content: "❌ No valid item numbers provided.",
        ephemeral: true,
      });
    const result = addItems(user, type, indices);
    let reply = "";
    if (result.added.length) reply += `✅ Added: ${result.added.join(", ")}\n`;
    if (result.already.length)
      reply += `ℹ Already in list: ${result.already.join(", ")}`;
    interaction.reply({ content: reply, ephemeral: true });
  } else if (cmd.startsWith("remove")) {
    if (indices.length === 0)
      return interaction.reply({
        content: "❌ No valid item numbers provided.",
        ephemeral: true,
      });
    const result = removeItems(user, type, indices);
    let reply = "";
    if (result.removed.length)
      reply += `✅ Removed: ${result.removed.join(", ")}\n`;
    if (result.notFound.length)
      reply += `ℹ Not in your list: ${result.notFound.join(", ")}`;
    interaction.reply({ content: reply, ephemeral: true });
  }

  // Check for matches after add/remove
  triggerMatches(user.id);
});

client.login(config.token);
