const { SlashCommandBuilder, PermissionsBitField, ChannelType } = require('discord.js');
const db = require('../../utils/db');
const updateMemberCounter = require('../../utils/updateMemberCounter');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setmembercounter')
        .setDescription('Define um canal de voz que exibe a contagem de membros automaticamente.')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageChannels)
        .addChannelOption(o =>
            o.setName('canal')
                .setDescription('Canal de voz para exibir o contador de membros.')
                .setRequired(true)
                .addChannelTypes(ChannelType.GuildVoice)
        ),
    aliases: ['membercounter', 'countermember'],
    detailedDescription: 'Configura um canal de voz cujo nome é atualizado automaticamente com o total de membros sempre que alguém entra ou sai do servidor.',
    usage: '`/setmembercounter #canal-de-voz`',
    permissions: ['Gerenciar Canais'],

    async execute(interaction) {
        if (!interaction.inGuild() || !interaction.guildId) {
            return interaction.reply({ content: 'Esse comando só pode ser usado dentro de um servidor.', flags: ['Ephemeral'] });
        }

        if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageChannels)) {
            return interaction.reply({ content: 'Você não tem permissão para gerenciar canais.', flags: ['Ephemeral'] });
        }

        const channel = interaction.options.getChannel('canal');
        if (!channel) {
            return interaction.reply({ content: 'Não encontrei o canal informado.', flags: ['Ephemeral'] });
        }

        db.set(`member_counter_${interaction.guildId}`, channel.id);

        // Atualiza imediatamente com a contagem atual
        await updateMemberCounter(interaction.guild);

        await interaction.reply({
            content: `✅ Canal de contagem definido: <#${channel.id}>. O nome será atualizado automaticamente quando membros entrarem ou saírem.`,
            flags: ['Ephemeral'],
        });
    },
};
