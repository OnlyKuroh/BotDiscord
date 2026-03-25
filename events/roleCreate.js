const { Events } = require('discord.js');
const db = require('../utils/db');
const { buildRoleCreateLogEmbed } = require('../utils/system-embeds');

module.exports = {
    name: Events.GuildRoleCreate,
    async execute(role) {
        if (!role.guild) return;

        const logChannelId = db.get(`logs_${role.guild.id}`);
        if (!logChannelId) return;

        const logChannel = role.guild.channels.cache.get(logChannelId);
        if (!logChannel) return;

        await logChannel.send({ embeds: [buildRoleCreateLogEmbed(role)] }).catch(() => null);
    },
};
