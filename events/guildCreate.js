const { Events } = require('discord.js');
const db = require('../utils/db');

module.exports = {
    name: Events.GuildCreate,
    async execute(guild) {
        db.addLog(
            'GUILD_JOIN',
            `Itadori adicionado ao servidor "${guild.name}" (${guild.memberCount} membros)`,
            guild.id,
            null,
            guild.name
        );

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
