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
    .setName("markdone")
    .setDescription("React to messages in the locked timeframe with a ✅")
    .addIntegerOption((option) =>
      option
        .setName("weeksback")
        .setDescription("How many weeks back to mark")
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
    const weeksBack = interaction.options.getInteger("weeksback") ?? 1;

    await interaction.reply({
      content: `Marking messages done ✅ for ${
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
    let reactedCount = 0;

    while (true) {
      const options = { limit: 100 };
      if (lastId) options.before = lastId;

      const messages = await channel.messages.fetch(options);
      if (messages.size === 0) break;

      const filtered = messages.filter(
        (msg) =>
          msg.createdAt >= start.toJSDate() &&
          msg.createdAt <= end.toJSDate() &&
          !msg.author.bot
      );

      if (filtered.size === 0) break;

      fetchedMessages.push(...filtered.values());
      lastId = messages.last()?.id;

      if (messages.size < 100) break;
    }

    for (const msg of fetchedMessages) {
      try {
        await msg.react("✅");
        reactedCount++;
      } catch (err) {
        console.warn(`Failed to react to message ${msg.id}:`, err.message);
      }
    }

    await interaction.editReply(
      reactedCount === 0
        ? "No messages found to mark done in that timeframe."
        : `✅ Marked ${reactedCount} message${
            reactedCount > 1 ? "s" : ""
          } as done.`
    );
  },
};
