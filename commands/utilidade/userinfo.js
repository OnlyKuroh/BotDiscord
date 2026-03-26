const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { formatResponse } = require('../../utils/persona');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('userinfo')
        .setDescription('Inspeciona os registros e o peso de um indivíduo.')
        .addUserOption(option => option.setName('alvo').setDescription('Aquele que será inspecionado.')),
    aliases: ['user'],
    detailedDescription: 'Veja quando um usuário decidiu entrar neste ciclo de dor, de sua criação ao ingresso no servidor.',
    usage: '`/userinfo` ou `-userinfo [@usuario]`',
    permissions: ['Nenhuma'],
    
    async execute(interaction) {
        const member = interaction.options.getMember('alvo') || interaction.member;
        const user = member.user;
        
        const embed = new EmbedBuilder()
            .setTitle(`Registros: ${user.tag}`)
            .setThumbnail(user.displayAvatarURL({ dynamic: true }))
            .addFields(
                { name: 'ID', value: user.id, inline: true },
                { name: 'Entrou no Discord', value: `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`, inline: false },
                { name: 'Entrou no Servidor', value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`, inline: false }
            )
            .setColor('#2b2d31');
            
        await interaction.reply({ content: formatResponse('Identidade analisada.'), embeds: [embed] });
    },
    
    async executePrefix(message, args) {
        let member = message.mentions.members.first() || message.member;
        
        const user = member.user;
        const embed = new EmbedBuilder()
            .setTitle(`Registros: ${user.tag}`)
            .setThumbnail(user.displayAvatarURL({ dynamic: true }))
            .addFields(
                { name: 'ID', value: user.id, inline: true },
                { name: 'Entrou no Discord', value: `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`, inline: false },
                { name: 'Entrou no Servidor', value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`, inline: false }
            )
            .setColor('#2b2d31');
            
        await message.reply({ content: formatResponse('Identidade analisada.'), embeds: [embed] });
    }
};
