const { SlashCommandBuilder } = require("discord.js");
const { DateTime } = require("luxon");
const config = require("../config.json");
const settings = require("../settings.json");

function getLastFixedWindow(weeksBack) {
  const now = DateTime.now().setZone(settings.timezone);

  const targetWeekday = settings.reminderDay === 0 ? 7 : settings.reminderDay;

  let end = now.set({
    weekday: targetWeekday,
    hour: settings.reminderHour,
    minute: settings.reminderMinute,
    second: 0,
    millisecond: 0,
  });

  if (end > now) {
    end = end.minus({ days: 7 });
  }

  if (weeksBack === 0) {
    // 0 weeks: from old breakpoint to now
    return { start: end, end: now };
  }

  const start = end.minus({ days: 7 * weeksBack });
  const adjustedEnd = end.minus({ days: 7 * (weeksBack - 1) });

  return { start, end: adjustedEnd };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("compileids")
    .setDescription(
      "Compiles all user/message IDs from a fixed period in the target channel"
    )
    .addIntegerOption((option) =>
      option
        .setName("weeks")
        .setDescription(
          "How many weeks back to include (0 = from last breakpoint to now)"
        )
        .setRequired(false)
        .addChoices(
          { name: "0 weeks (until now)", value: 0 },
          { name: "1 week", value: 1 },
          { name: "2 weeks", value: 2 },
          { name: "3 weeks", value: 3 },
          { name: "4 weeks", value: 4 }
        )
    )
    .addStringOption((option) =>
      option
        .setName("destination")
        .setDescription("Where to send the output")
        .setRequired(false)
        .addChoices(
          { name: "DM", value: "dm" },
          { name: "Channel (ephemeral)", value: "channel" }
        )
    ),

  async execute(interaction) {
    const weeksBack = interaction.options.getInteger("weeks");
    const selectedWeeks = weeksBack !== null ? weeksBack : 1;

    const channel = await interaction.guild.channels.fetch(config.channelId);
    if (!channel || !channel.isTextBased()) {
      return interaction.reply({
        content: "❌ Target channel not found or not text-based.",
        flags: 64,
      });
    }

    const { start, end } = getLastFixedWindow(selectedWeeks);

    let lastId;
    let fetchedMessages = [];

    // Fetch messages in chunks, stop when we go past start time
    while (true) {
      const options = { limit: 100 };
      if (lastId) options.before = lastId;

      const messages = await channel.messages.fetch(options);
      if (messages.size === 0) break;

      // Filter messages within the timeframe
      const filtered = messages.filter(
        (msg) =>
          msg.createdTimestamp >= start.toMillis() &&
          msg.createdTimestamp < end.toMillis()
      );

      if (filtered.size > 0) {
        fetchedMessages.push(...Array.from(filtered.values()).reverse());
      }

      lastId = messages.last().id;

      // If the earliest fetched message is older than start, stop
      if (messages.last().createdTimestamp < start.toMillis()) break;

      if (messages.size < 100) break;
    }

    const ID_REGEX = /\b\d{17,20}\b/g;
    const allIds = new Set();

    for (const msg of fetchedMessages) {
      const matches = msg.content.match(ID_REGEX);
      if (matches) {
        matches.forEach((id) => allIds.add(`<@${id}>`));
      }
    }

    const outputList = allIds.size
      ? `**IDs from ${start.toFormat("FF")} to ${end.toFormat(
          "FF"
        )}:**\n\`\`\`\n${[...allIds].join("\n")}\n\`\`\``
      : "No IDs found in that period.";

    const outputInline = allIds.size
      ? `**Inline List:**\n\`\`\`\n${[...allIds].join(" ")}\n\`\`\``
      : null;

    const destination =
      interaction.options.getString("destination") || "channel";

    if (destination === "dm") {
      try {
        await interaction.user.send(outputList);
        if (outputInline) {
          await interaction.user.send(outputInline);
        }
        await interaction.reply({
          content: "📬 I sent the IDs to your DMs!",
          flags: 64,
        });
      } catch {
        await interaction.reply({
          content: "❌ Could not send you a DM. Do you have DMs disabled?",
          flags: 64,
        });
      }
    } else {
      await interaction.reply({ content: outputList, flags: 64 });
      if (outputInline) {
        await interaction.followUp({ content: outputInline, flags: 64 });
      }
    }
  },
};
