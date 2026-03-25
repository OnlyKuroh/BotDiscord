const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { formatResponse } = require('../../utils/persona');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('avatar')
        .setDescription('🖼️ Ver avatar de um usuário em alta resolução')
        .addUserOption(option => option.setName('alvo').setDescription('Usuário para ver o avatar')),
    aliases: ['foto', 'icon'],
    detailedDescription: 'Mostra o avatar de um usuário em resolução máxima (1024px) com links para download.',
    usage: '`/avatar` ou `/avatar [@usuario]`',
    permissions: ['Nenhuma'],

    async execute(interaction) {
        const user = interaction.options.getUser('alvo') || interaction.user;
        const member = interaction.guild?.members.cache.get(user.id);
        await interaction.reply(buildAvatarReply(user, member, interaction.user));
    },

    async executePrefix(message, args) {
        const user = message.mentions.users.first() || message.author;
        const member = message.guild?.members.cache.get(user.id);
        await message.reply(buildAvatarReply(user, member, message.author));
    }
};

function buildAvatarReply(user, member, requester) {
    const globalAvatar = user.displayAvatarURL({ size: 1024, dynamic: true });
    const serverAvatar = member?.displayAvatarURL({ size: 1024, dynamic: true });
    const hasServerAvatar = serverAvatar && serverAvatar !== globalAvatar;

    const embed = new EmbedBuilder()
        .setColor(member?.displayHexColor !== '#000000' ? member?.displayHexColor : '#C41230')
        .setAuthor({ name: `Avatar de ${user.displayName}`, iconURL: globalAvatar })
        .setImage(globalAvatar)
        .setFooter({ text: `Solicitado por ${requester.username}`, iconURL: requester.displayAvatarURL() })
        .setTimestamp();

    if (hasServerAvatar) {
        embed.setThumbnail(serverAvatar);
        embed.setDescription('> 🖼️ Avatar global (grande) • Avatar do servidor (miniatura)');
    }

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setLabel('PNG').setURL(user.displayAvatarURL({ size: 1024, extension: 'png' })).setStyle(ButtonStyle.Link),
        new ButtonBuilder().setLabel('JPG').setURL(user.displayAvatarURL({ size: 1024, extension: 'jpg' })).setStyle(ButtonStyle.Link),
        new ButtonBuilder().setLabel('WebP').setURL(user.displayAvatarURL({ size: 1024, extension: 'webp' })).setStyle(ButtonStyle.Link),
    );

    return { embeds: [embed], components: [row] };
}
