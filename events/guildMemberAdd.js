const { Events, EmbedBuilder } = require('discord.js');
const db = require('../utils/db');
const updateMemberCounter = require('../utils/updateMemberCounter');
const { buildMemberJoinLogEmbed } = require('../utils/system-embeds');
const { evaluatePlatformMilestones } = require('../utils/milestone-announcer');
const { resolveWelcomeBannerForGuild } = require('../utils/persistent-panels');
const { renderTemplatePlaceholders } = require('../utils/template-placeholders');

module.exports = {
    name: Events.GuildMemberAdd,
    async execute(member) {
        // --- CONTADOR DE MEMBROS ---
        await updateMemberCounter(member.guild);
        await evaluatePlatformMilestones(member.client);

        // --- AUTO ROLE PARA BOTS ---
        if (member.user.bot) {
            const roleVerify = '1481553129437921491';
            const roleBot = '1481638269774069790';
            await member.roles.add([roleVerify, roleBot]).catch(() => null);
            return;
        }

        // --- AUTO ROLES CONFIGURÁVEIS ---
        const autoRoles = db.get(`auto_roles_${member.guild.id}`);
        if (Array.isArray(autoRoles) && autoRoles.length > 0) {
            await member.roles.add(autoRoles.filter(Boolean)).catch(() => null);
        }

        const welcomeData = db.get(`welcome_${member.guild.id}`);
        if (!welcomeData || !welcomeData.channelId) return;

        const channel = member.guild.channels.cache.get(welcomeData.channelId);
        if (!channel) return; // Canal foi deletado

        const rawText = welcomeData.text || '';
        const parts = rawText.split('|');
        let title = parts[0]?.trim() || 'NOVO CICLO';
        let desc = parts[1]?.trim() || '';

        // Contexto para substituição de variáveis
        const templateCtx = {
            userMention:    `<@${member.user.id}>`,
            userName:       member.user.globalName || member.user.username,
            guildName:      member.guild.name,
            channelMention: `<#${channel.id}>`,
            userAvatar:     member.user.displayAvatarURL({ extension: 'png', size: 256 }),
            userBanner:     member.user.bannerURL?.({ extension: 'png', size: 512 }) || '',
        };

        title = renderTemplatePlaceholders(title, templateCtx);
        desc  = renderTemplatePlaceholders(desc,  templateCtx);

        const embed = new EmbedBuilder()
            .setColor('#430000') // tom carmesim, sangue. Engrenagem não tem frescura.
            .setTitle(title)
            .setDescription(desc || 'Alguém acabou de entrar neste campo de batalha.')
            .setFooter({ text: `${member.user.globalName || member.user.username} | ID: ${member.user.id} | ${new Date().toLocaleString('pt-BR')}` });

        const bannerUrl = await resolveWelcomeBannerForGuild(member.guild, welcomeData);
        if (bannerUrl) {
            embed.setImage(bannerUrl);
        }

        try {
            await channel.send({ embeds: [embed] });
        } catch(error) {
            console.error(`Falha a recepção: ${error}`);
        }

        // --- SISTEMA DE LOG ---
        const logChannelId = db.get(`logs_${member.guild.id}`);
        if (!logChannelId) return;

        const logChannel = member.guild.channels.cache.get(logChannelId);
        if (!logChannel) return;

        db.addLog('MEMBER_JOIN', `Entrada de ${member.user.username}`, member.guild.id, member.user.id, member.user.username);
        await logChannel.send({ embeds: [buildMemberJoinLogEmbed(member)] }).catch(() => null);
    },
};
