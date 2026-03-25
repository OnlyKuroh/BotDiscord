const { Events, EmbedBuilder } = require('discord.js');
const db = require('../utils/db');

module.exports = {
    name: Events.GuildBanAdd,
    async execute(ban) {
        if (!ban.guild) return;

        const logChannelId = db.get(`logs_${ban.guild.id}`);
        if (!logChannelId) return;

        const logChannel = ban.guild.channels.cache.get(logChannelId);
        if (!logChannel) return;

        const embed = new EmbedBuilder()
            .setColor('#c0392b') // Vermelho escuro - banido
            .setAuthor({ name: 'Colheita Executada', iconURL: ban.user.displayAvatarURL({ dynamic: true }) })
            .setDescription(`🔨 <@${ban.user.id}> foi banido.\n\n💀 **Motivo:**\n\`${ban.reason || 'Nenhum motivo providenciado pelo Carrasco.'}\``)
            .setTimestamp()
            .setFooter({ text: `ID: ${ban.user.id} • ${ban.user.username} • ${ban.guild.name}`, iconURL: ban.user.displayAvatarURL({ dynamic: true }) });

        await logChannel.send({ embeds: [embed] }).catch(() => null);
        db.addLog('BAN', `${ban.user.username} foi banido de ${ban.guild.name}`, ban.guild.id, ban.user.id, ban.user.username);
    },
};
