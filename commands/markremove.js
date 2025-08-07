const { SlashCommandBuilder } = require("discord.js");
const { DateTime } = require("luxon");
const settings = require("../settings.json");

function getFixedWindow(weeksBack) {
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
    // 0 weeks = from last breakpoint end → now
    return { start: end, end: now };
  }

  const start = end.minus({ days: 7 * weeksBack });
  const adjustedEnd = end.minus({ days: 7 * (weeksBack - 1) });

  return { start, end: adjustedEnd };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("markremove")
    .setDescription(
      "Removes ✅ reactions from all messages in the locked window"
    )
    .addIntegerOption((option) =>
      option
        .setName("weeks")
        .setDescription("How many weeks back to include")
        .setRequired(false)
        .addChoices(
          { name: "0 weeks (from last breakpoint to now)", value: 0 },
          { name: "1 week", value: 1 },
          { name: "2 weeks", value: 2 },
          { name: "3 weeks", value: 3 },
          { name: "4 weeks", value: 4 }
        )
    ),

  async execute(interaction) {
    const weeksBack = interaction.options.getInteger("weeks") ?? 1;

    await interaction.reply({
      content: `Removing ✅ reactions from ${
        weeksBack === 0
          ? "last breakpoint to now"
          : `the last ${weeksBack} week(s)`
      }...`,
      flags: 64,
    });

    const channel = interaction.channel;
    const { start, end } = getFixedWindow(weeksBack);

    let fetchedMessages = [];
    let lastId;
    let removedCount = 0;

    while (true) {
      const options = { limit: 100 };
      if (lastId) options.before = lastId;

      const messages = await channel.messages.fetch(options);
      if (messages.size === 0) break;

      const filtered = messages.filter(
        (msg) =>
          msg.createdAt >= start.toJSDate() && msg.createdAt <= end.toJSDate()
      );

      if (filtered.size === 0) break;

      fetchedMessages.push(...filtered.values());
      lastId = messages.last()?.id;

      if (messages.size < 100) break;
    }

    for (const msg of fetchedMessages) {
      const checkReaction = msg.reactions.cache.get("✅");
      if (checkReaction) {
        try {
          await checkReaction.remove();
          removedCount++;
        } catch (err) {
          console.warn(
            `❌ Couldn’t remove ✅ from message ${msg.id}:`,
            err.message
          );
        }
      }
    }

    await interaction.editReply({
      content:
        removedCount === 0
          ? "No ✅ reactions found to remove in that timeframe."
          : `✅ Removed ✅ from ${removedCount} message${
              removedCount > 1 ? "s" : ""
            }.`,
    });
  },
};
