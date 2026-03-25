const { SlashCommandBuilder, PermissionsBitField, ChannelType } = require('discord.js');
const db = require('../../utils/db');
const { formatResponse } = require('../../utils/persona');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setnovidades')
        .setDescription('Define o canal que recebera atualizacoes automaticas e avisos de novos servidores.')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild)
        .addChannelOption((option) =>
            option
                .setName('canal')
                .setDescription('Canal onde as novidades vao pousar')
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                .setRequired(true)
        )
        .addRoleOption((option) =>
            option
                .setName('cargo')
                .setDescription('Cargo opcional para mencionar depois da novidade')
                .setRequired(false)
        ),
    aliases: ['novidades', 'setupdatefeed'],
    detailedDescription: 'Configura o canal oficial de changelog automatico, noticias e avisos de entrada em novos servidores, incluindo resumo via IA, icone e banner.',
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
        const role = interaction.options.getRole('cargo');
        if (!channel || !channel.isTextBased()) {
            return interaction.reply({ content: formatResponse('Escolha um canal de texto valido para receber as atualizacoes.'), flags: ['Ephemeral'] });
        }

        db.set(`novidades_channel_${interaction.guildId}`, channel.id);
        if (role) db.set(`novidades_role_${interaction.guildId}`, role.id);
        else db.delete(`novidades_role_${interaction.guildId}`);
        db.addLog('UPDATES_SETUP', `/setnovidades configurado para #${channel.name}`, interaction.guildId, interaction.user.id, interaction.user.username);

        await interaction.reply({
            content: formatResponse(`Canal <#${channel.id}> marcado como destino oficial das novidades.${role ? ` O cargo <@&${role.id}> vai ser chamado nas postagens futuras.` : ' Nenhum cargo vai ser chamado por enquanto.'}`),
            flags: ['Ephemeral'],
        });
    },

    async executePrefix(message) {
        if (!message.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            return message.reply({ content: formatResponse('Somente administradores podem decidir para onde as novidades vao sangrar.') });
        }

        const channel = message.mentions.channels.first();
        const role = message.mentions.roles.first();
        if (!channel || !channel.isTextBased()) {
            return message.reply({ content: formatResponse('Mencione um canal de texto valido. Exemplo: `-setnovidades #updates`.') });
        }

        db.set(`novidades_channel_${message.guild.id}`, channel.id);
        if (role) db.set(`novidades_role_${message.guild.id}`, role.id);
        else db.delete(`novidades_role_${message.guild.id}`);
        db.addLog('UPDATES_SETUP', `Canal de novidades definido para #${channel.name}`, message.guild.id, message.author.id, message.author.username);

        await message.reply({ content: formatResponse(`Pronto. As proximas atualizacoes automaticas e os avisos de novos servidores vao cair em <#${channel.id}>.${role ? ` No fim de cada postagem eu marco ${role}.` : ''}`) });
    },
};
