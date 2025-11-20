const fs = require("fs");
const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
} = require("discord.js");
const config = require("./config.json");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
});

// Items list in order
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

// Utility to parse number lists from commands
function parseNumbers(input) {
  return input
    .split(/[ ,]+/) // split by space or comma
    .map((x) => parseInt(x))
    .filter((x) => !isNaN(x) && x >= 1 && x <= items.length)
    .map((x) => x - 1); // convert to 0-index
}

// Add items to user's list
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

// Remove items from user's list
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

// Matching logic
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

// Trigger matches for a user
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

// Register slash commands
const commands = [
  new SlashCommandBuilder()
    .setName("addrequest")
    .setDescription("Add items to your requests")
    .addStringOption((option) =>
      option
        .setName("items")
        .setDescription("Numbers of items separated by space or comma")
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("removerequest")
    .setDescription("Remove items from your requests")
    .addStringOption((option) =>
      option
        .setName("items")
        .setDescription("Numbers of items separated by space or comma")
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("addduplicate")
    .setDescription("Add items to your duplicates")
    .addStringOption((option) =>
      option
        .setName("items")
        .setDescription("Numbers of items separated by space or comma")
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("removeduplicate")
    .setDescription("Remove items from your duplicates")
    .addStringOption((option) =>
      option
        .setName("items")
        .setDescription("Numbers of items separated by space or comma")
        .setRequired(true)
    ),
].map((cmd) => cmd.toJSON());

// Deploy commands
const rest = new REST({ version: "10" }).setToken(config.token);

(async () => {
  try {
    console.log("Refreshing slash commands...");
    await rest.put(
      Routes.applicationGuildCommands(client.user?.id || "0", config.guildId),
      { body: commands }
    );
    console.log("Slash commands registered.");
  } catch (err) {
    console.error(err);
  }
})();

client.on("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);
  // Register slash commands when ready
  try {
    await rest.put(
      Routes.applicationGuildCommands(client.user.id, config.guildId),
      { body: commands }
    );
    console.log("Slash commands registered.");
  } catch (err) {
    console.error(err);
  }
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const user = interaction.user;
  const cmd = interaction.commandName;
  const raw = interaction.options.getString("items");
  const indices = parseNumbers(raw);

  if (indices.length === 0) {
    return interaction.reply({
      content: "❌ No valid item numbers provided.",
      ephemeral: true,
    });
  }

  let type = "";
  let allowedChannel = null;

  switch (cmd) {
    case "addrequest":
      type = "requests";
      allowedChannel = config.requestsChannelId;
      break;
    case "removerequest":
      type = "requests";
      allowedChannel = config.requestsChannelId;
      break;
    case "addduplicate":
      type = "duplicates";
      allowedChannel = config.duplicatesChannelId;
      break;
    case "removeduplicate":
      type = "duplicates";
      allowedChannel = config.duplicatesChannelId;
      break;
    default:
      return;
  }

  if (interaction.channel.id !== allowedChannel) {
    return interaction.reply({
      content: `❌ This command can only be used in the designated channel.`,
      ephemeral: true,
    });
  }

  let result;
  if (cmd.startsWith("add")) {
    result = addItems(user, type, indices);
    let reply = "";
    if (result.added.length) reply += `✅ Added: ${result.added.join(", ")}\n`;
    if (result.already.length)
      reply += `ℹ Already in list: ${result.already.join(", ")}`;
    interaction.reply({ content: reply, ephemeral: true });
  } else if (cmd.startsWith("remove")) {
    result = removeItems(user, type, indices);
    let reply = "";
    if (result.removed.length)
      reply += `✅ Removed: ${result.removed.join(", ")}\n`;
    if (result.notFound.length)
      reply += `ℹ Not in your list: ${result.notFound.join(", ")}`;
    interaction.reply({ content: reply, ephemeral: true });
  }

  triggerMatches(user.id);
});

client.login(config.token);
