// deploy-commands.js
const fs = require("node:fs");
const { REST, Routes } = require("discord.js");
const config = require("./config.json");

const commands = [];
const commandFiles = fs
  .readdirSync("./commands")
  .filter((file) => file.endsWith(".js"));

for (const file of commandFiles) {
  const command = require(`./commands/${file}`);
  commands.push(command.data.toJSON());
}

const rest = new REST({ version: "10" }).setToken(config.token);

(async () => {
  try {
    console.log("🚀 Deploying slash commands...");
    await rest.put(
      Routes.applicationGuildCommands(config.clientId, config.guildId),
      { body: commands }
    );
    console.log("✅ Successfully deployed commands.");
  } catch (err) {
    console.error("❌ Error deploying commands:", err);
  }
})();
