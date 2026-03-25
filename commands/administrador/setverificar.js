const { SlashCommandBuilder, EmbedBuilder, PermissionsBitField } = require('discord.js');
const db = require('../../utils/db');
const { formatResponse } = require('../../utils/persona');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setverificar')
        .setDescription('Define este canal como o portão de verificação.')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
    
    async execute(interaction, client) {
        // Guardamos o ID do canal como canal de verificação
        db.set(`verify_channel_${interaction.guildId}`, interaction.channelId);

        const embed = new EmbedBuilder()
            .setColor('#4b0082') // Indigo escuro, místico
            .setAuthor({ name: 'Segurança do Domínio', iconURL: client.user.displayAvatarURL() })
            .setTitle('Seja Bem-Vindo Ao Cabrall Community')
            .setDescription('• Para liberar todos os canais deste servidor, será necessário você digitar a palavra **verificar** abaixo para garantir que não é nenhum tipo de bot.')
            .setThumbnail(client.user.displayAvatarURL())
            .setFooter({ text: 'Proteção Ativa • Engrenagem Itadori' });

        await interaction.reply({ content: formatResponse('O campo de verificação foi erguido. Somente os dignos passarão.'), flags: ['Ephemeral'] });
        await interaction.channel.send({ embeds: [embed] });
    }
};
