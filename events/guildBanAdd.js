const { Events } = require('discord.js');
const db = require('../utils/db');
const { buildBanLogEmbed } = require('../utils/system-embeds');

module.exports = {
    name: Events.GuildBanAdd,
    async execute(ban) {
        if (!ban.guild) return;

        const logChannelId = db.get(`logs_${ban.guild.id}`);
        if (!logChannelId) return;

        const logChannel = ban.guild.channels.cache.get(logChannelId);
        if (!logChannel) return;

        await logChannel.send({ embeds: [buildBanLogEmbed(ban)] }).catch(() => null);
        db.addLog('BAN', `${ban.user.username} foi banido de ${ban.guild.name}`, ban.guild.id, ban.user.id, ban.user.username);
    },
};
