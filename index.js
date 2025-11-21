const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
} = require("discord.js");
const db = require("./db");
const config = {
  token: process.env.DISCORD_TOKEN,
  guildId: process.env.GUILD_ID,
  requestsChannelId: process.env.REQUESTS_CHANNEL_ID,
  duplicatesChannelId: process.env.DUPLICATES_CHANNEL_ID,
  autoMatchChannelId: process.env.MATCHES_CHANNEL_ID,
  listManagementChannelId: process.env.LIST_MANAGEMENT_CHANNEL_ID,
  serverOwnerId: process.env.SERVER_OWNER_ID, // optional override
};

// Items master list (final list you provided)
const items = [
  "BATCAVE ACCESS CARD",
  "RA'S AL GHUL'S LAZARUS PIT",
  "ANKH AMULET",
  "HELMET OF FATE",
  "MANACLES OF FORCE",
  "POWER GLOVE",
  "SEAL OF CLARITY",
  "TRIDENT OF NEPTUNE",
  "THE MERCILESS",
  "THE DROWNED",
  "THE DEVASTATOR",
  "RED DEATH",
  "THE BATMAN WHO LAUGHS",
  "CLEANING SUPPLIES",
  "THE PENGUIN'S UMBRELLA",
  "LIQUID NITROGEN TANK",
  "HARVEY DENT'S COURT TRANSCRIPTS",
  "THE RIDDLER'S PUZZLE SIMULATOR",
  "SILPHIUM SEEDS",
  "THE JOKER FISH",
  "MAGGIE KYLE'S TREATMENT PLAN",
  "ALFRED'S CONTENGENCY PLANS",
  "DAMIAN WAYNE'S GENETIC CODE",
  "JASON TODD'S RESOURCE PACKAGE",
  "CYBERNETIC NERVE IMPLANT",
  "COLD CASE LIBRARY",
  "PROTOTYPE BATRANG",
  "GORDON'S POLICE BADGE",
  "JASON TODD'S ROBIN COSTUME",
  "CATWOMAN'S ENGAGEMENT RING",
  "ARKHAM ASYLUM KEY",
  "THE JOKER'S TOXIN VIAL",
];

// helper to parse numbers (1-based -> 0-based)
function parseNumbers(input) {
  return input
    .split(/[ ,]+/)
    .map((x) => parseInt(x))
    .filter((x) => !isNaN(x) && x >= 1 && x <= items.length)
    .map((x) => x - 1);
}

// Build a stable match key so identical matches are not re-sent.
// We sort user IDs to keep pair order consistent and sort item lists for determinism.
function buildMatchKey(userA, userB, aNeeds, bNeeds) {
  const [u1, u2] = [userA, userB].sort();
  // For determinism, sort arrays of ints
  const as = [...aNeeds].sort((a, b) => a - b).join(",");
  const bs = [...bNeeds].sort((a, b) => a - b).join(",");
  return `${u1}|${u2}|A:${as}|B:${bs}`;
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
});

// Slash commands definitions
const commands = [
  new SlashCommandBuilder()
    .setName("addrequest")
    .setDescription("Add items to your requests")
    .addStringOption((opt) =>
      opt
        .setName("items")
        .setRequired(true)
        .setDescription("Numbers separated by space or comma")
    ),
  new SlashCommandBuilder()
    .setName("addduplicate")
    .setDescription("Add items to your duplicates")
    .addStringOption((opt) =>
      opt
        .setName("items")
        .setRequired(true)
        .setDescription("Numbers separated by space or comma")
    ),
  new SlashCommandBuilder()
    .setName("removerequest")
    .setDescription("Remove items from your requests")
    .addStringOption((opt) =>
      opt
        .setName("items")
        .setRequired(true)
        .setDescription("Numbers separated by space or comma")
    ),
  new SlashCommandBuilder()
    .setName("removeduplicate")
    .setDescription("Remove items from your duplicates")
    .addStringOption((opt) =>
      opt
        .setName("items")
        .setRequired(true)
        .setDescription("Numbers separated by space or comma")
    ),
  new SlashCommandBuilder()
    .setName("viewmylists")
    .setDescription("View your requests and duplicates"),
].map((c) => c.toJSON());

const rest = new REST({ version: "10" }).setToken(config.token);

// Register commands after ready
client.once("clieantReady", async () => {
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

// Enforce slash-commands-only channels for users except owner/admin
client.on("messageCreate", async (msg) => {
  try {
    if (msg.author.bot) return;
    if (!msg.guild) return;

    const allowedChannels = [
      config.requestsChannelId,
      config.duplicatesChannelId,
    ];
    if (!allowedChannels.includes(msg.channel.id)) return;

    // determine owner id
    let ownerId = config.serverOwnerId || msg.guild.ownerId;
    if (!ownerId) {
      try {
        const g = await msg.guild.fetch();
        ownerId = config.serverOwnerId || g.ownerId;
      } catch (e) {
        // ignore
      }
    }

    const isOwner = ownerId ? msg.author.id === ownerId : false;
    const isAdmin = msg.member?.permissions?.has?.("Administrator");

    if (isOwner || isAdmin) return; // owner & admins allowed to post

    // delete non slash messages
    if (!msg.content.startsWith("/")) {
      await msg.delete().catch(() => {});
      msg.author
        .send(`❌ Please only use slash commands in #${msg.channel.name}`)
        .catch(() => {});
    }
  } catch (err) {
    console.error("message enforcement error", err);
  }
});

// interaction handler
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const userId = interaction.user.id;
  const cmd = interaction.commandName;
  const raw = interaction.options.getString("items");
  const indices = raw ? parseNumbers(raw) : [];

  const isAdd = cmd.startsWith("add");
  const isRemove = cmd.startsWith("remove");

  // channel permission mapping
  const addRequestChannel = config.requestsChannelId;
  const addDuplicateChannel = config.duplicatesChannelId;
  const listManagementChannel = config.listManagementChannelId;

  // validate where command allowed
  if (cmd === "addrequest" && interaction.channel.id !== addRequestChannel) {
    return interaction.reply({
      content: "❌ Use this command in the requests channel.",
      ephemeral: true,
    });
  }
  if (
    cmd === "addduplicate" &&
    interaction.channel.id !== addDuplicateChannel
  ) {
    return interaction.reply({
      content: "❌ Use this command in the duplicates channel.",
      ephemeral: true,
    });
  }
  if (
    (cmd === "removerequest" ||
      cmd === "removeduplicate" ||
      cmd === "viewmylists") &&
    interaction.channel.id !== listManagementChannel
  ) {
    return interaction.reply({
      content: "❌ Use this command in the list-management channel.",
      ephemeral: true,
    });
  }

  // view lists
  if (cmd === "viewmylists") {
    // pull typed items from DB
    const all = await db.getAllUserItemsTyped();
    const me = all[userId] || { requests: [], duplicates: [] };
    const fmt = (arr) =>
      arr.length ? arr.map((i) => `${i + 1}. ${items[i]}`).join("\n") : "None";
    const text = `**Your Requests:**\n${fmt(
      me.requests
    )}\n\n**Your Duplicates:**\n${fmt(me.duplicates)}`;
    return interaction.reply({ content: text, ephemeral: true });
  }

  // for add/remove commands we need indices
  if (indices.length === 0) {
    return interaction.reply({
      content: "❌ No valid item numbers provided.",
      ephemeral: true,
    });
  }

  // Build typed user key: userId + '|R' for requests, '|D' for duplicates
  let type = "";
  if (cmd.endsWith("request")) type = "R";
  else type = "D";
  const userKey = `${userId}|${type}`;

  try {
    if (isAdd) {
      // add items
      await db.addUserItemsTyped(userKey, indices);
      // build results for reply: we need to know which items were already present and which were new.
      // We'll fetch current list for this user key
      const all = await db.getAllUserItemsTyped();
      const me = all[userId] || { requests: [], duplicates: [] };
      const list = type === "R" ? me.requests : me.duplicates;
      // Determine added vs already: compare sets
      const added = indices.filter((i) => list.includes(i));
      // but that includes previously-existing; to compute added vs already we would need pre-state.
      // Simpler: respond showing current set and mention the numbers added.
      const addedNames = indices.map((i) => `${i + 1}. ${items[i]}`);
      return interaction
        .reply({
          content: `✅ Your list updated. Added (requested):\n${addedNames.join(
            "\n"
          )}`,
          ephemeral: true,
        })
        .then(() => triggerMatchesForUser(userId));
    } else if (isRemove) {
      // remove items
      await db.removeUserItemsTyped(userKey, indices);
      const removedNames = indices.map((i) => `${i + 1}. ${items[i]}`);
      return interaction
        .reply({
          content: `✅ Removed:\n${removedNames.join("\n")}`,
          ephemeral: true,
        })
        .then(() => triggerMatchesForUser(userId));
    }
  } catch (err) {
    console.error("DB operation error", err);
    return interaction.reply({
      content: "❌ An internal error occurred.",
      ephemeral: true,
    });
  }
});

// Build matches and notify, using DB to avoid duplicate sends
async function triggerMatchesForUser(changedUserId) {
  try {
    // load all typed user items
    const all = await db.getAllUserItemsTyped(); // { userId: { requests:[], duplicates:[] } }

    // If small scale (few users), computing in JS is fine.
    const userIds = Object.keys(all);

    for (let i = 0; i < userIds.length; i++) {
      for (let j = i + 1; j < userIds.length; j++) {
        const aId = userIds[i];
        const bId = userIds[j];
        const a = all[aId];
        const b = all[bId];
        if (!a || !b) continue;
        const aNeeds = (a.requests || []).filter((x) =>
          (b.duplicates || []).includes(x)
        );
        const bNeeds = (b.requests || []).filter((x) =>
          (a.duplicates || []).includes(x)
        );

        if (aNeeds.length > 0 && bNeeds.length > 0) {
          // Only send if match hasn't been recorded
          const matchKey = buildMatchKey(aId, bId, aNeeds, bNeeds);
          const already = await db.hasMatchKey(matchKey);
          if (already) continue;

          // record it first (so concurrent runs won't double-send)
          await db.insertMatchRecord(
            matchKey,
            aId,
            bId,
            aNeeds.map(String),
            bNeeds.map(String)
          );

          // Prepare messages
          const userA = await client.users.fetch(aId).catch(() => null);
          const userB = await client.users.fetch(bId).catch(() => null);

          const aItemsText = aNeeds
            .map((i) => `${i + 1}. ${items[i]}`)
            .join(", ");
          const bItemsText = bNeeds
            .map((i) => `${i + 1}. ${items[i]}`)
            .join(", ");

          if (userA) {
            userA
              .send(
                `🔔 Match Found!\nYou can get from **${
                  userB ? userB.tag : bId
                }**: ${aItemsText}\nYou can give: ${bItemsText}`
              )
              .catch(() => {});
          }
          if (userB) {
            userB
              .send(
                `🔔 Match Found!\nYou can get from **${
                  userA ? userA.tag : aId
                }**: ${bItemsText}\nYou can give: ${aItemsText}`
              )
              .catch(() => {});
          }

          // post in matches channel with mentions
          const matchChannel = await client.channels
            .fetch(config.autoMatchChannelId)
            .catch(() => null);
          if (matchChannel && matchChannel.isTextBased && matchChannel.guild) {
            await matchChannel
              .send(
                `🔗 **New Match!** <@${aId}> ↔ <@${bId}>\n<@${aId}> can get: ${aItemsText}\n<@${bId}> can get: ${bItemsText}`
              )
              .catch(() => {});
          }
        }
      }
    }
  } catch (err) {
    console.error("triggerMatches error", err);
  }
}

client.login(config.token);
