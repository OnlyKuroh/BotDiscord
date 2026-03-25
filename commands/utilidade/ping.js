const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { formatResponse } = require('../../utils/persona');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ping')
        .setDescription('🏓 Verifica a latência do bot e da API.'),
    aliases: ['latencia', 'status'],
    detailedDescription: 'Mede a latência de resposta do bot e a conexão WebSocket com o Discord.',
    usage: '`/ping` ou `-ping`',
    permissions: ['Nenhuma'],

    async execute(interaction) {
        const sent = await interaction.reply({ content: '🏓 Calculando...', fetchReply: true });
        const latency = sent.createdTimestamp - interaction.createdTimestamp;
        const wsping = interaction.client.ws.ping;
        const status = wsping < 100 ? '🟢 Excelente' : wsping < 200 ? '🟡 Bom' : '🔴 Alto';

        const embed = new EmbedBuilder()
            .setColor(wsping < 100 ? '#57F287' : wsping < 200 ? '#FEE75C' : '#ED4245')
            .setAuthor({ name: 'Latência do Bot', iconURL: interaction.client.user.displayAvatarURL() })
            .addFields(
                { name: '📡 API (WebSocket)', value: `\`${wsping}ms\``, inline: true },
                { name: '⚡ Resposta', value: `\`${latency}ms\``, inline: true },
                { name: '📊 Status', value: status, inline: true },
            )
            .setFooter({ text: `Solicitado por ${interaction.user.username}`, iconURL: interaction.user.displayAvatarURL() })
            .setTimestamp();

        await interaction.editReply({ content: null, embeds: [embed] });
    },

    async executePrefix(message, args, client) {
        const sent = await message.reply('🏓 Calculando...');
        const latency = sent.createdTimestamp - message.createdTimestamp;
        const wsping = client.ws.ping;
        const status = wsping < 100 ? '🟢 Excelente' : wsping < 200 ? '🟡 Bom' : '🔴 Alto';

        const embed = new EmbedBuilder()
            .setColor(wsping < 100 ? '#57F287' : wsping < 200 ? '#FEE75C' : '#ED4245')
            .setAuthor({ name: 'Latência do Bot', iconURL: client.user.displayAvatarURL() })
            .addFields(
                { name: '📡 API (WebSocket)', value: `\`${wsping}ms\``, inline: true },
                { name: '⚡ Resposta', value: `\`${latency}ms\``, inline: true },
                { name: '📊 Status', value: status, inline: true },
            )
            .setFooter({ text: `Solicitado por ${message.author.username}`, iconURL: message.author.displayAvatarURL() })
            .setTimestamp();

        await sent.edit({ content: null, embeds: [embed] });
    }
};
