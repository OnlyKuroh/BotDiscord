const { SlashCommandBuilder, PermissionsBitField, ChannelType } = require('discord.js');
const db = require('../../utils/db');
const { formatResponse } = require('../../utils/persona');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setnovidades')
        .setDescription('Define o canal que recebera atualizacoes automaticas do bot e do dashboard.')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild)
        .addChannelOption((option) =>
            option
                .setName('canal')
                .setDescription('Canal onde as novidades vao pousar')
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                .setRequired(true)
        ),
    aliases: ['novidades', 'setupdatefeed'],
    detailedDescription: 'Configura o canal oficial de changelog automatico, gerado pela IA a partir das mudancas detectadas no bot e no dashboard.',
    usage: '`/setnovidades #canal`',
    permissions: ['Administrador / Gerenciar Servidor'],

    async execute(interaction) {
        if (!interaction.inGuild() || !interaction.guildId) {
            return interaction.reply({ content: formatResponse('Esse comando so pode ser usado dentro de um servidor.'), flags: ['Ephemeral'] });
        }

        if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageGuild)) {
            return interaction.reply({ content: formatResponse('Somente administradores podem decidir para onde as novidades vao sangrar.'), flags: ['Ephemeral'] });
        }

        const channel = interaction.options.getChannel('canal');
        if (!channel || !channel.isTextBased()) {
            return interaction.reply({ content: formatResponse('Escolha um canal de texto valido para receber as atualizacoes.'), flags: ['Ephemeral'] });
        }

        db.set(`novidades_channel_${interaction.guildId}`, channel.id);
        db.addLog('UPDATES_SETUP', `/setnovidades configurado para #${channel.name}`, interaction.guildId, interaction.user.id, interaction.user.username);

        await interaction.reply({
            content: formatResponse(`Canal <#${channel.id}> marcado como destino oficial das novidades. No proximo deploy relevante, eu mesmo aviso por la.`),
            flags: ['Ephemeral'],
        });
    },

    async executePrefix(message) {
        if (!message.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            return message.reply({ content: formatResponse('Somente administradores podem decidir para onde as novidades vao sangrar.') });
        }

        const channel = message.mentions.channels.first();
        if (!channel || !channel.isTextBased()) {
            return message.reply({ content: formatResponse('Mencione um canal de texto valido. Exemplo: `-setnovidades #updates`.') });
        }

        db.set(`novidades_channel_${message.guild.id}`, channel.id);
        db.addLog('UPDATES_SETUP', `Canal de novidades definido para #${channel.name}`, message.guild.id, message.author.id, message.author.username);

        await message.reply({ content: formatResponse(`Pronto. As proximas atualizacoes automaticas vao cair em <#${channel.id}>.`) });
    },
};
