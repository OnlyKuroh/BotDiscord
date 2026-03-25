const { Events } = require('discord.js');
const db = require('../utils/db');
const { evaluatePlatformMilestones } = require('../utils/milestone-announcer');

module.exports = {
    name: Events.GuildDelete,
    async execute(guild, client) {
        const knownGuildIds = client.guilds.cache.map((cachedGuild) => cachedGuild.id);
        db.set('known_guild_ids', knownGuildIds);
        db.addLog('GUILD_LEAVE', `Bot removido do servidor "${guild.name}" (${guild.id})`, guild.id, null, guild.name);
        await evaluatePlatformMilestones(client);
    },
};
