const { SlashCommandBuilder, EmbedBuilder, PermissionsBitField } = require('discord.js');
const { formatResponse } = require('../../utils/persona');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('kick')
        .setDescription('Expulsa um usuário do servidor.')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.KickMembers)
        // Ordem reforçada: obrigatórios antes dos opcionais
        .addUserOption(option => option.setName('alvo').setDescription('O usuário a ser expulso.').setRequired(true))
        .addStringOption(option => option.setName('motivo').setDescription('Motivo da expulsão.').setRequired(false)),
    aliases: ['chute', 'expulsar'],
    detailedDescription: 'Expulsa temporariamente um usuário do servidor. Ele pode voltar com um novo convite.',
    usage: '`/kick [@usuario] [motivo]`',
    permissions: ['Expulsar Membros'],

    async execute(interaction) {
        if (!interaction.inGuild() || !interaction.guild) {
            return interaction.reply({ content: formatResponse('Esse comando só pode ser usado dentro de um servidor.'), flags: ['Ephemeral'] });
        }

        if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.KickMembers)) {
            return interaction.reply({ content: formatResponse('Você não tem permissão para expulsar membros.'), flags: ['Ephemeral'] });
        }

        const targetUser = interaction.options.getUser('alvo');
        const member = targetUser ? await interaction.guild.members.fetch(targetUser.id).catch(() => null) : null;
        const reason = interaction.options.getString('motivo') || 'Nenhum motivo informado.';

        if (!member) return interaction.reply({ content: formatResponse('Usuário não encontrado no servidor.'), flags: ['Ephemeral'] });
        if (!member.kickable) return interaction.reply({ content: formatResponse('Não consigo expulsar este usuário. Ele pode ter um cargo superior.'), flags: ['Ephemeral'] });
        if (member.id === interaction.user.id) return interaction.reply({ content: formatResponse('Você não pode se expulsar.'), flags: ['Ephemeral'] });

        await member.kick(reason);

        const embed = new EmbedBuilder()
            .setAuthor({ name: 'Membro Expulso', iconURL: member.user.displayAvatarURL() })
            .setColor('#FEE75C')
            .setThumbnail(member.user.displayAvatarURL({ size: 128 }))
            .addFields(
                { name: '👤 Usuário', value: `${member.user.tag}\n\`${member.id}\``, inline: true },
                { name: '👮 Moderador', value: `${interaction.user.tag}`, inline: true },
                { name: '📝 Motivo', value: reason },
            )
            .setFooter({ text: '👢 Sistema de Moderação • Kick' })
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    },

    async executePrefix(message, args) {
        if (!message.member.permissions.has(PermissionsBitField.Flags.KickMembers)) {
            return message.reply(formatResponse('Você não tem permissão para expulsar membros.'));
        }

        const member = message.mentions.members.first();
        const reason = args.slice(1).join(' ') || 'Nenhum motivo informado.';

        if (!member) return message.reply(formatResponse('Mencione o usuário que deseja expulsar.'));
        if (!member.kickable) return message.reply(formatResponse('Não consigo expulsar este usuário.'));
        if (member.id === message.author.id) return message.reply(formatResponse('Você não pode se expulsar.'));

        await member.kick(reason);

        const embed = new EmbedBuilder()
            .setAuthor({ name: 'Membro Expulso', iconURL: member.user.displayAvatarURL() })
            .setColor('#FEE75C')
            .setThumbnail(member.user.displayAvatarURL({ size: 128 }))
            .addFields(
                { name: '👤 Usuário', value: `${member.user.tag}\n\`${member.id}\``, inline: true },
                { name: '👮 Moderador', value: `${message.author.tag}`, inline: true },
                { name: '📝 Motivo', value: reason },
            )
            .setFooter({ text: '👢 Sistema de Moderação • Kick' })
            .setTimestamp();

        await message.reply({ embeds: [embed] });
    }
};
