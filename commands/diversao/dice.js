const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { formatResponse } = require('../../utils/persona');

const DICE_FACES = {
    1: '⚀', 2: '⚁', 3: '⚂', 4: '⚃', 5: '⚄', 6: '⚅',
};

function buildEmbed(result, faces, user) {
    const isD6 = faces === 6;
    const emoji = isD6 ? (DICE_FACES[result] || '🎲') : '🎲';
    const isHigh = result > faces * 0.7;
    const isLow = result <= faces * 0.3;
    const cor = isHigh ? '#57F287' : isLow ? '#ED4245' : '#FEE75C';

    return new EmbedBuilder()
        .setAuthor({ name: `${user.displayName} rolou um d${faces}`, iconURL: user.displayAvatarURL() })
        .setTitle(`${emoji} Resultado: ${result}`)
        .setDescription(`> Dado de **${faces} lados** — o número sorteado foi **${result}**`)
        .setColor(cor)
        .addFields(
            { name: '🎯 Resultado', value: `**${result}** / ${faces}`, inline: true },
            { name: '📊 Chance', value: `${(100 / faces).toFixed(1)}%`, inline: true },
        )
        .setFooter({ text: '🎲 Dados' })
        .setTimestamp();
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('dice')
        .setDescription('Role e dependa do acaso.')
        .addIntegerOption(option => option.setName('lados').setDescription('Número de faces. O padrão é 6.').setRequired(false)),
    aliases: ['dado', 'roll'],
    detailedDescription: 'O bater do material nas quinas do mundo até exibir um número.',
    usage: '`/dice [número_lados]`',
    permissions: ['Nenhuma'],

    async execute(interaction) {
        const faces = interaction.options.getInteger('lados') || 6;
        if (faces <= 1) return interaction.reply({ content: formatResponse('Jogue como um adulto. Preciso de pelo menos 2 lados.'), flags: ['Ephemeral'] });
        if (faces > 1000) return interaction.reply({ content: formatResponse('Um dado com mais de 1000 lados? Isso nem existe.'), flags: ['Ephemeral'] });

        const result = Math.floor(Math.random() * faces) + 1;
        const embed = buildEmbed(result, faces, interaction.user);
        await interaction.reply({ embeds: [embed] });
    },

    async executePrefix(message, args) {
        let faces = parseInt(args[0]) || 6;
        if (faces <= 1) return message.reply(formatResponse('Preciso de pelo menos 2 lados.'));
        if (faces > 1000) return message.reply(formatResponse('Um dado com mais de 1000 lados? Isso nem existe.'));

        const result = Math.floor(Math.random() * faces) + 1;
        const embed = buildEmbed(result, faces, message.author);
        await message.reply({ embeds: [embed] });
    }
};
