const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const db = require('../../utils/db');
const { formatResponse } = require('../../utils/persona');
const { ensureVerificationPanel } = require('../../utils/persistent-panels');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setverificar')
        .setDescription('Define este canal como o portão de verificação.')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
    
    async execute(interaction, client) {
        // Guardamos o ID do canal como canal de verificação
        db.set(`verify_channel_${interaction.guildId}`, interaction.channelId);

        await interaction.reply({ content: formatResponse('O campo de verificação foi erguido. Somente os dignos passarão.'), flags: ['Ephemeral'] });
        await ensureVerificationPanel(client, interaction.guildId);
    }
};
