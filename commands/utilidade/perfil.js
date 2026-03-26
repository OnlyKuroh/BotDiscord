const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { formatResponse } = require('../../utils/persona');
const {
    isJjkGuild,
    getProfileView,
    formatRelativeDuration,
    JJK_GUILD_ID,
} = require('../../utils/jjk-system');

function buildPerfilEmbed(member, view) {
    const { profile, progress, progressBar, grace, bonusPct, badges, freezePrice } = view;
    const flames = profile.streak > 0 ? '🔥'.repeat(Math.min(profile.streak, 5)) : '🪫';
    const graceLine = grace?.active
        ? `⚠️ ** •  Refrescagem aberta:** mais ${formatRelativeDuration(grace.remainingMs)} para segurar a chama com \`${freezePrice}\` Ryō.`
        : '✅ ** •  Chama estável:** sem janela de risco aberta agora.';

    return new EmbedBuilder()
        .setColor('#c1121f')
        .setAuthor({ name: 'Perfil Jujutsu • Ficha do Feiticeiro', iconURL: member.user.displayAvatarURL({ dynamic: true }) })
        .setTitle(member.displayName)
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 512 }))
        .setDescription([
            `**Grau atual:** \`${profile.level}\``,
            `**Energia Amaldiçoada:** \`${profile.xp}\` XP`,
            `${progressBar} \`${progress.currentLevelXp}/${progress.nextLevelXp}\` para o próximo grau`,
            '',
            `**${flames}  •  Foguinhos:** Sequência atual de **${profile.streak}** dia${profile.streak === 1 ? '' : 's'}`,
            `** 🪔  •  Bônus da chama:** +${bonusPct}%`,
            graceLine,
        ].join('\n'))
        .addFields(
            {
                name: 'Bolso do Feiticeiro',
                value: [
                    `**Ryō:** \`${profile.money}\``,
                    `**Lootboxes:** \`${profile.lootboxes}\``,
                    `**Melhor sequência:** \`${profile.bestStreak}\``,
                ].join('\n'),
                inline: true,
            },
            {
                name: 'Engajamento Real',
                value: [
                    `**Mensagens válidas:** \`${profile.totalMeaningfulMessages}\``,
                    `**Comandos contados:** \`${profile.totalCommands}\``,
                    `**Minutos em call:** \`${profile.totalVoiceMinutes}\``,
                ].join('\n'),
                inline: true,
            },
            {
                name: 'Emblemas',
                value: badges,
                inline: false,
            },
        )
        .setFooter({ text: 'Sistema JJK exclusivo do servidor • chat, call e constância contam de verdade' })
        .setTimestamp();
}

function isInteractionTarget(target) {
    return Boolean(target && typeof target.isRepliable === 'function');
}

async function replyPerfil(target, member) {
    if (!isJjkGuild(member.guild.id)) {
        const text = `Esse perfil JJK está ligado só no servidor principal \`${JJK_GUILD_ID}\`.`;
        if (isInteractionTarget(target)) {
            return target.reply({ content: formatResponse(text), flags: ['Ephemeral'] });
        }
        return target.reply({ content: formatResponse(text) });
    }

    const view = getProfileView(member.guild.id, member.id);
    const embed = buildPerfilEmbed(member, view);
    return target.reply({ embeds: [embed] });
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('perfil')
        .setDescription('Mostra a ficha Jujutsu completa de um membro do servidor principal.')
        .addUserOption((option) =>
            option.setName('alvo').setDescription('Quem vai ter a ficha lida').setRequired(false)
        ),
    aliases: ['ficha', 'jjkperfil'],
    detailedDescription: 'Painel principal do sistema JJK do servidor. Mostra grau, XP, foguinhos, bolso, lootboxes, emblemas e risco de perder a sequência.',
    usage: '`/perfil [@usuario]` ou `-perfil [@usuario]`',
    permissions: ['Nenhuma'],

    async execute(interaction) {
        const member = interaction.options.getMember('alvo') || interaction.member;
        return replyPerfil(interaction, member);
    },

    async executePrefix(message) {
        const member = message.mentions.members.first() || message.member;
        return replyPerfil(message, member);
    },
};
