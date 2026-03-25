const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { formatResponse } = require('../../utils/persona');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('serverinfo')
        .setDescription('Mostra a força e a constituição deste domínio.'),
    aliases: ['server', 'dominio'],
    detailedDescription: 'Verifique a estrutura de quem habita este servidor e dados cruciais como criação e segurança.',
    usage: '`/serverinfo` ou `-serverinfo`',
    permissions: ['Nenhuma'],
    
    async execute(interaction) {
        const { guild } = interaction;
        const embed = new EmbedBuilder()
            .setTitle(guild.name)
            .setThumbnail(guild.iconURL({ dynamic: true }))
            .addFields(
                { name: 'Membros', value: `${guild.memberCount}`, inline: true },
                { name: 'Canais', value: `${guild.channels.cache.size}`, inline: true },
                { name: 'Criado em', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:R>`, inline: true }
            )
            .setColor('#2b2d31');
            
        await interaction.reply({ content: formatResponse('Conheça o campo de batalha antes de lutar.'), embeds: [embed] });
    },
    
    async executePrefix(message) {
        const { guild } = message;
        const embed = new EmbedBuilder()
            .setTitle(guild.name)
            .setThumbnail(guild.iconURL({ dynamic: true }))
            .addFields(
                { name: 'Membros', value: `${guild.memberCount}`, inline: true },
                { name: 'Canais', value: `${guild.channels.cache.size}`, inline: true },
                { name: 'Criado em', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:R>`, inline: true }
            )
            .setColor('#2b2d31');
            
        await message.reply({ content: formatResponse('Conheça o campo de batalha antes de lutar.'), embeds: [embed] });
    }
};
