const { Events } = require('discord.js');
const { handleGuildJoin } = require('../utils/guild-join-announcer');
const { evaluatePlatformMilestones } = require('../utils/milestone-announcer');

module.exports = {
    name: Events.GuildCreate,
    async execute(guild, client) {
        await handleGuildJoin(client, guild, { detectedAfterRestart: false, suppressLog: false });
        await evaluatePlatformMilestones(client);
        if (global._dashboardIo) {
            global._dashboardIo.emit('guildJoin', {
                id: guild.id,
                name: guild.name,
                icon: guild.iconURL({ size: 128, extension: 'webp' }) || null,
                memberCount: guild.memberCount,
                ownerId: guild.ownerId,
                joinedAt: new Date(),
            });
        }

        console.log(`[GUILD JOIN] Itadori adicionado a: ${guild.name} (${guild.id}) — ${guild.memberCount} membros`);
    },
};
