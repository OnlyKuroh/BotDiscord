const { Events } = require('discord.js');
const db = require('../utils/db');
const { buildMessageDeleteLogEmbed } = require('../utils/system-embeds');

module.exports = {
    name: Events.MessageDelete,
    async execute(message) {
        if (!message.guild || !message.author || message.author.bot) return;

        const logChannelId = db.get(`logs_${message.guild.id}`);
        if (!logChannelId) return;

        const logChannel = message.guild.channels.cache.get(logChannelId);
        if (!logChannel) return;

        // Tentar buscar o log de auditoria para saber quem apagou. Mas na maioria das vezes, o discord atrasa.
        db.addLog('MSG_DELETE', `Mensagem de ${message.author.username} apagada em <#${message.channel.id}>`, message.guild.id, message.author.id, message.author.username);
        await logChannel.send({ embeds: [buildMessageDeleteLogEmbed(message)] }).catch(() => null);
    },
};
