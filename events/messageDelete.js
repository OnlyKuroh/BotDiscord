const { Events, EmbedBuilder } = require('discord.js');
const db = require('../utils/db');

module.exports = {
    name: Events.MessageDelete,
    async execute(message) {
        if (!message.guild || !message.author || message.author.bot) return;

        const logChannelId = db.get(`logs_${message.guild.id}`);
        if (!logChannelId) return;

        const logChannel = message.guild.channels.cache.get(logChannelId);
        if (!logChannel) return;

        // Tentar buscar o log de auditoria para saber quem apagou. Mas na maioria das vezes, o discord atrasa.
        const embed = new EmbedBuilder()
            .setColor('#e74c3c')
            .setAuthor({ name: 'Rastro Apagado', iconURL: message.author.displayAvatarURL({ dynamic: true }) })
            .setDescription(`**Usuário:** <@${message.author.id}> | **Onde:** <#${message.channel.id}>\n**O que foi dito:** ${message.content || 'Apenas anexos/vazio'}`)
            .setTimestamp()
            .setFooter({ text: `ID: ${message.author.id} • ${message.author.username} • ${message.guild.name}`, iconURL: message.author.displayAvatarURL({ dynamic: true }) });
            
        db.addLog('MSG_DELETE', `Mensagem de ${message.author.username} apagada em <#${message.channel.id}>`, message.guild.id, message.author.id, message.author.username);
        await logChannel.send({ embeds: [embed] }).catch(() => null);
    },
};
