const { SlashCommandBuilder, EmbedBuilder, PermissionsBitField } = require('discord.js');
const { formatResponse } = require('../../utils/persona');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ban')
        .setDescription('Bane um usuário permanentemente do servidor.')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.BanMembers)
        // Ordem reforçada: obrigatórios antes dos opcionais
        .addUserOption(option => option.setName('alvo').setDescription('O usuário a ser banido.').setRequired(true))
        .addStringOption(option => option.setName('motivo').setDescription('Motivo do banimento.').setRequired(false)),
    aliases: ['banir', 'martelo'],
    detailedDescription: 'Bane permanentemente um usuário do servidor. Requer permissão de Banir Membros.',
    usage: '`/ban [@usuario] [motivo]`',
    permissions: ['Banir Membros'],

    async execute(interaction) {
        if (!interaction.inGuild() || !interaction.guild) {
            return interaction.reply({ content: formatResponse('Esse comando só pode ser usado dentro de um servidor.'), flags: ['Ephemeral'] });
        }

        if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.BanMembers)) {
            return interaction.reply({ content: formatResponse('Você não tem permissão para banir membros.'), flags: ['Ephemeral'] });
        }

        const targetUser = interaction.options.getUser('alvo');
        const member = targetUser ? await interaction.guild.members.fetch(targetUser.id).catch(() => null) : null;
        const reason = interaction.options.getString('motivo') || 'Nenhum motivo informado.';

        if (!member) return interaction.reply({ content: formatResponse('Usuário não encontrado no servidor.'), flags: ['Ephemeral'] });
        if (!member.bannable) return interaction.reply({ content: formatResponse('Não consigo banir este usuário. Ele pode ter um cargo superior.'), flags: ['Ephemeral'] });
        if (member.id === interaction.user.id) return interaction.reply({ content: formatResponse('Você não pode se banir.'), flags: ['Ephemeral'] });

        await member.ban({ reason });

        const embed = new EmbedBuilder()
            .setAuthor({ name: 'Membro Banido', iconURL: member.user.displayAvatarURL() })
            .setColor('#ED4245')
            .setThumbnail(member.user.displayAvatarURL({ size: 128 }))
            .addFields(
                { name: '👤 Usuário', value: `${member.user.tag}\n\`${member.id}\``, inline: true },
                { name: '👮 Moderador', value: `${interaction.user.tag}`, inline: true },
                { name: '📝 Motivo', value: reason },
            )
            .setFooter({ text: '🔨 Sistema de Moderação • Ban' })
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    },

    async executePrefix(message, args) {
        if (!message.member.permissions.has(PermissionsBitField.Flags.BanMembers)) {
            return message.reply(formatResponse('Você não tem permissão para banir membros.'));
        }

        const member = message.mentions.members.first();
        const reason = args.slice(1).join(' ') || 'Nenhum motivo informado.';

        if (!member) return message.reply(formatResponse('Mencione o usuário que deseja banir.'));
        if (!member.bannable) return message.reply(formatResponse('Não consigo banir este usuário.'));
        if (member.id === message.author.id) return message.reply(formatResponse('Você não pode se banir.'));

        await member.ban({ reason });

        const embed = new EmbedBuilder()
            .setAuthor({ name: 'Membro Banido', iconURL: member.user.displayAvatarURL() })
            .setColor('#ED4245')
            .setThumbnail(member.user.displayAvatarURL({ size: 128 }))
            .addFields(
                { name: '👤 Usuário', value: `${member.user.tag}\n\`${member.id}\``, inline: true },
                { name: '👮 Moderador', value: `${message.author.tag}`, inline: true },
                { name: '📝 Motivo', value: reason },
            )
            .setFooter({ text: '🔨 Sistema de Moderação • Ban' })
            .setTimestamp();

        await message.reply({ embeds: [embed] });
    }
};
