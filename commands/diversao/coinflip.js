const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { formatResponse } = require('../../utils/persona');

function buildEmbed(resultado, user) {
    const isCara = resultado === 'Cara';
    return new EmbedBuilder()
        .setAuthor({ name: `${user.displayName} lançou a moeda`, iconURL: user.displayAvatarURL() })
        .setTitle(`${isCara ? '🪙' : '💰'} ${resultado}!`)
        .setDescription(`> A moeda girou no ar e caiu com o lado **${resultado}** para cima.`)
        .setColor(isCara ? '#FFD700' : '#C0C0C0')
        .setFooter({ text: '🪙 Cara ou Coroa' })
        .setTimestamp();
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('coinflip')
        .setDescription('O jogo duplo. Cara ou coroa.'),
    aliases: ['moeda', 'caraoucoroa'],
    detailedDescription: 'Lance seu resultado aos céus com dor e consequência. Cara, ou coroa.',
    usage: '`/coinflip`',
    permissions: ['Nenhuma'],

    async execute(interaction) {
        const outcome = Math.random() < 0.5 ? 'Cara' : 'Coroa';
        const embed = buildEmbed(outcome, interaction.user);
        await interaction.reply({ embeds: [embed] });
    },

    async executePrefix(message) {
        const outcome = Math.random() < 0.5 ? 'Cara' : 'Coroa';
        const embed = buildEmbed(outcome, message.author);
        await message.reply({ embeds: [embed] });
    }
};
