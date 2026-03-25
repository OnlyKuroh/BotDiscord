const { SlashCommandBuilder, EmbedBuilder, PermissionsBitField } = require('discord.js');
const { formatResponse } = require('../../utils/persona');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('clear')
        .setDescription('Apaga mensagens em massa no canal.')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageMessages)
        // Ordem reforçada: obrigatórios antes dos opcionais
        .addIntegerOption(option => option.setName('quantia').setDescription('Quantidade de mensagens (1-100).').setRequired(true))
        .addUserOption(option => option.setName('usuario').setDescription('Filtrar mensagens de um usuário específico.').setRequired(false)),
    aliases: ['limpar', 'purge'],
    detailedDescription: 'Apaga até 100 mensagens por vez. Pode filtrar por usuário. Mensagens com +14 dias não podem ser apagadas em massa.',
    usage: '`/clear [quantia]` ou `/clear [quantia] [@usuario]`',
    permissions: ['Gerenciar Mensagens'],

    async execute(interaction) {
        if (!interaction.inGuild() || !interaction.channel || !interaction.channel.isTextBased()) {
            return interaction.reply({ content: formatResponse('Esse comando só pode ser usado em um canal de texto do servidor.'), flags: ['Ephemeral'] });
        }

        if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageMessages)) {
            return interaction.reply({ content: formatResponse('Você não tem permissão para gerenciar mensagens.'), flags: ['Ephemeral'] });
        }

        const amount = interaction.options.getInteger('quantia');
        const targetUser = interaction.options.getUser('usuario');

        if (amount < 1 || amount > 100) return interaction.reply({ content: formatResponse('A quantidade deve ser entre 1 e 100.'), flags: ['Ephemeral'] });

        await interaction.deferReply({ flags: ['Ephemeral'] });

        let deleted;
        if (targetUser) {
            const fetched = await interaction.channel.messages.fetch({ limit: 100 });
            const filtered = fetched.filter(m => m.author.id === targetUser.id).first(amount);
            deleted = await interaction.channel.bulkDelete(filtered, true);
        } else {
            deleted = await interaction.channel.bulkDelete(amount, true);
        }

        const embed = new EmbedBuilder()
            .setAuthor({ name: interaction.user.displayName, iconURL: interaction.user.displayAvatarURL() })
            .setTitle('🧹 Mensagens Apagadas')
            .setColor('#5865F2')
            .addFields(
                { name: '🗑️ Apagadas', value: `**${deleted.size}** mensagens`, inline: true },
                { name: '📝 Solicitadas', value: `**${amount}** mensagens`, inline: true },
            )
            .setFooter({ text: '🧹 Sistema de Moderação • Clear' })
            .setTimestamp();

        if (targetUser) embed.addFields({ name: '🎯 Filtro', value: `${targetUser.tag}`, inline: true });
        if (deleted.size < amount) embed.addFields({ name: '⚠️ Nota', value: 'Mensagens com +14 dias não podem ser apagadas em massa.' });

        await interaction.editReply({ embeds: [embed] });
    },

    async executePrefix(message, args) {
        if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
            return message.reply(formatResponse('Você não tem permissão para gerenciar mensagens.'));
        }

        const amount = parseInt(args[0]);
        if (isNaN(amount) || amount < 1 || amount > 100) return message.reply(formatResponse('A quantidade deve ser entre 1 e 100.'));

        await message.delete().catch(() => null);

        const targetUser = message.mentions.users.first();
        let deleted;

        if (targetUser) {
            const fetched = await message.channel.messages.fetch({ limit: 100 });
            const filtered = fetched.filter(m => m.author.id === targetUser.id).first(amount);
            deleted = await message.channel.bulkDelete(filtered, true);
        } else {
            deleted = await message.channel.bulkDelete(amount, true);
        }

        const embed = new EmbedBuilder()
            .setTitle('🧹 Mensagens Apagadas')
            .setColor('#5865F2')
            .addFields(
                { name: '🗑️ Apagadas', value: `**${deleted.size}** mensagens`, inline: true },
                { name: '👮 Moderador', value: message.author.tag, inline: true },
            )
            .setFooter({ text: '🧹 Sistema de Moderação • Clear' })
            .setTimestamp();

        const rep = await message.channel.send({ embeds: [embed] });
        setTimeout(() => rep.delete().catch(() => null), 8000);
    }
};
