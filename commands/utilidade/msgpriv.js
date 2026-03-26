const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { isWindowActive, ensureWindow } = require('../../utils/temp-command-window');

const STAFF_CHANNEL_ID = '1483130521650462950';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('msgpriv')
        .setDescription('[TEMPORARIO] Responde em privado ao dono do bot.')
        .addStringOption((option) =>
            option
                .setName('mensagem')
                .setDescription('Mensagem para a staff')
                .setRequired(true)
        ),
    hiddenFromDashboard: true,
    hiddenFromHelp: true,

    async execute(interaction, client) {
        ensureWindow();
        if (!isWindowActive()) {
            return interaction.reply({
                content: 'Esse comando temporario ja expirou.',
                flags: ['Ephemeral'],
            });
        }

        const content = interaction.options.getString('mensagem', true).trim();
        const staffChannel = await client.channels.fetch(STAFF_CHANNEL_ID).catch(() => null);

        if (!staffChannel?.isTextBased?.()) {
            return interaction.reply({
                content: 'Nao encontrei o canal de staff para encaminhar essa resposta.',
                flags: ['Ephemeral'],
            });
        }

        const embed = new EmbedBuilder()
            .setColor('#3498db')
            .setAuthor({
                name: `${interaction.user.username} respondeu pelo msgpriv`,
                iconURL: interaction.user.displayAvatarURL({ dynamic: true }),
            })
            .setTitle('Contato recebido de outro servidor')
            .setDescription(content)
            .addFields(
                { name: 'Servidor', value: `${interaction.guild?.name || 'DM'}\n\`${interaction.guildId || 'sem-id'}\``, inline: true },
                { name: 'Usuario', value: `<@${interaction.user.id}>\n\`${interaction.user.id}\``, inline: true },
                { name: 'Canal', value: interaction.channelId ? `<#${interaction.channelId}>` : 'Desconhecido', inline: true },
            )
            .setTimestamp();

        await staffChannel.send({ embeds: [embed] }).catch(() => null);

        return interaction.reply({
            content: 'Mensagem entregue para a staff. Valeu por responder.',
            flags: ['Ephemeral'],
        });
    },
};
