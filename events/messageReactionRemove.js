const { Events } = require('discord.js');
const db = require('../utils/db');

module.exports = {
    name: Events.MessageReactionRemove,
    async execute(reaction, user) {
        // Ignora reações de bots
        if (user.bot) return;

        // Se a reação for parcial, busca completa
        if (reaction.partial) {
            try {
                await reaction.fetch();
            } catch (error) {
                console.error('[REACTION] Erro ao buscar reação:', error);
                return;
            }
        }

        const { message, emoji } = reaction;
        const guildId = message.guildId;
        if (!guildId) return;

        // ── Reaction Role Panel (dashboard) ──────────────────────────────────
        const emojiStr = emoji.id
            ? `<${emoji.animated ? 'a' : ''}:${emoji.name}:${emoji.id}>`
            : emoji.name;
        const reactionCfgKey = `reaction_cfg_${message.id}_${emojiStr}`;
        const reactionCfg = db.get(reactionCfgKey);
        if (reactionCfg) {
            // Only reverse add_role: if user removes reaction, remove the role
            if (reactionCfg.action !== 'add_role' || !reactionCfg.roleId) return;
            if (message.partial) {
                try { await message.fetch(); } catch { return; }
            }
            const guild = message.guild;
            if (!guild) return;
            const member = await guild.members.fetch(user.id).catch(() => null);
            if (!member) return;
            try {
                if (member.roles.cache.has(reactionCfg.roleId)) await member.roles.remove(reactionCfg.roleId);
            } catch (err) {
                console.error('[reaction_remove]', err);
            }
            return;
        }

        // Verifica se é o canal de painel de notícias
        const newsPanelChannel = db.get(`news_panel_channel_${guildId}`);
        if (!newsPanelChannel || message.channelId !== newsPanelChannel) return;
        const newsPanelMessage = db.get(`news_panel_message_${guildId}`);
        if (newsPanelMessage && message.id !== newsPanelMessage) return;

        // Verifica se a mensagem é do bot
        if (message.author.id !== message.client.user.id) return;

        // Busca o membro
        const member = await message.guild.members.fetch(user.id).catch(() => null);
        if (!member) return;

        // Mapa de emojis para eventos
        const EMOJI_TO_EVENT = {
            '🎌': 'anime',
            '📰': 'noticias',
            '🏛️': 'politica_br',
            '🌍': 'politica_mun',
            '🤖': 'ia_news',
            '💹': 'financeiro',
            '💱': 'cotacao',
            '🔍': 'google_news',
            '♈': 'horoscopo',
            '🎮': 'steam',
            '🏆': 'esports_lol',
            '🗳️': 'eleicao',
        };

        const emojiName = emoji.name;
        const eventKey = EMOJI_TO_EVENT[emojiName];

        if (!eventKey) return;

        // Busca configuração do evento
        const eventsConfig = db.get(`events_${guildId}`) || {};
        const conf = eventsConfig[eventKey];

        if (!conf?.roleId) return;

        const roleId = conf.roleId;

        try {
            // Remove o cargo
            await member.roles.remove(roleId);
            await user.send(`✅ Cargo <@&${roleId}> **removido**. Você não receberá mais notificações sobre **${eventKey}**.`).catch(() => null);
        } catch (err) {
            console.error('[NEWS_ROLE]', err.message);
            await user.send('❌ Não consegui remover seu cargo. Verifique se o bot tem permissão para gerenciar cargos.').catch(() => null);
        }
    },
};
