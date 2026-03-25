const { SlashCommandBuilder, PermissionsBitField, ChannelType } = require('discord.js');
const db = require('../../utils/db');
const { formatResponse } = require('../../utils/persona');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setlogs')
        .setDescription('Olha cada passo e sombra. Define o canal dos registros (logs).')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild)
        .addChannelOption(option =>
            option
                .setName('canal')
                .setDescription('Canal observatório')
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                .setRequired(true)
        ),
    aliases: ['logs', 'observatorio'],
    detailedDescription: 'Define um canal para sangrar todas as transações, modificações, perfis ou atalhos feitos no servidor.',
    usage: '`/setlogs [#canal]` e `-setlogs [#canal]`',
    permissions: ['Administrador / Gerenciar Servidor'],
    
    async execute(interaction) {
        if (!interaction.inGuild() || !interaction.guildId) {
            return interaction.reply({ content: formatResponse('Esse comando só pode ser usado dentro de um servidor.'), flags: ['Ephemeral'] });
        }

        if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageGuild)) {
            return interaction.reply({ content: formatResponse('Não tente se entrometer em assuntos que não lhe cabem.'), flags: ['Ephemeral'] });
        }

        const channel = interaction.options.getChannel('canal');
        if (!channel || !channel.isTextBased()) {
            return interaction.reply({ content: formatResponse('Aponte um canal de texto válido para receber os registros.'), flags: ['Ephemeral'] });
        }

        db.set(`logs_${interaction.guildId}`, channel.id);
        
        await interaction.reply({ content: formatResponse(`Canal <#${channel.id}> convertido no Olho Direto. As sombras não existem mais.`), flags: ['Ephemeral'] });
    },
    
    async executePrefix(message, args) {
        if (!message.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            return message.reply({ content: formatResponse('Não tente se entrometer em assuntos que não lhe cabem.') });
        }
        
        const channel = message.mentions.channels.first();
        if(!channel) return message.reply(formatResponse('Aponte um canal. Aponte com precisão.'));

        db.set(`logs_${message.guild.id}`, channel.id);
        await message.reply(formatResponse(`Canal <#${channel.id}> convertido no Olho Direto. As sombras não existem mais.`));
    }
};
