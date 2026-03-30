const { Events } = require('discord.js');
const db = require('../utils/db');

module.exports = {
    name: Events.MessageReactionAdd,
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

        // ── Pagination Panel (dashboard) ─────────────────────────────────────
        const paginationKey = `pagination_${message.id}`;
        const paginationCfg = db.get(paginationKey);
        if (paginationCfg) {
            try { await reaction.users.remove(user.id); } catch { /* ignore */ }
            const { EmbedBuilder } = require('discord.js');
            let { currentPage, pages, prevEmoji, nextEmoji, headerMsg } = paginationCfg;
            const emojiName = emoji.id ? `<${emoji.animated ? 'a' : ''}:${emoji.name}:${emoji.id}>` : emoji.name;
            if (emojiName === (prevEmoji || '⬅️')) {
                currentPage = Math.max(0, currentPage - 1);
            } else if (emojiName === (nextEmoji || '➡️')) {
                currentPage = Math.min(pages.length - 1, currentPage + 1);
            } else {
                return;
            }
            db.set(paginationKey, { ...paginationCfg, currentPage });
            const page = pages[currentPage];
            const embed = new EmbedBuilder().setColor(page.color || '#C41230');
            if (page.title) embed.setTitle(page.title);
            if (page.description) embed.setDescription(page.description);
            if (page.image) embed.setImage(page.image);
            if (page.thumbnail) embed.setThumbnail(page.thumbnail);
            if (page.authorName) embed.setAuthor({ name: page.authorName, iconURL: page.authorIcon || undefined });
            embed.setFooter({ text: page.footerText || `Página ${currentPage + 1} de ${pages.length}` });
            try { await message.edit({ content: headerMsg || null, embeds: [embed] }); } catch (err) { console.error('[pagination]', err); }
            return;
        }

        // ── Reaction Role Panel (dashboard) ──────────────────────────────────
        const emojiStr = emoji.id
            ? `<${emoji.animated ? 'a' : ''}:${emoji.name}:${emoji.id}>`
            : emoji.name;
        const reactionCfgKey = `reaction_cfg_${message.id}_${emojiStr}`;
        const reactionCfg = db.get(reactionCfgKey);
        if (reactionCfg) {
            if (message.partial) {
                try { await message.fetch(); } catch { return; }
            }
            const guild = message.guild;
            if (!guild) return;
            const member = await guild.members.fetch(user.id).catch(() => null);
            if (!member) return;
            try {
                if (reactionCfg.action === 'add_role' && reactionCfg.roleId) {
                    if (!member.roles.cache.has(reactionCfg.roleId)) await member.roles.add(reactionCfg.roleId);
                } else if (reactionCfg.action === 'remove_role' && reactionCfg.roleId) {
                    if (member.roles.cache.has(reactionCfg.roleId)) await member.roles.remove(reactionCfg.roleId);
                } else if (reactionCfg.action === 'text_dm' || reactionCfg.action === 'text_visible') {
                    const text = reactionCfg.text || 'Ação de reação.';
                    if (reactionCfg.action === 'text_dm') {
                        await user.send(text).catch(() => null);
                    } else {
                        const ch = guild.channels.cache.get(reactionCfg.channelId);
                        if (ch) await ch.send(`<@${user.id}> ${text}`).catch(() => null);
                    }
                }
            } catch (err) {
                console.error('[reaction_add]', err);
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

        if (!conf?.roleId) {
            return user.send(`❌ O evento **${eventKey}** não tem um cargo configurado. Peça a um admin para configurar no dashboard.`).catch(() => null);
        }

        const roleId = conf.roleId;

        try {
            // Adiciona o cargo
            await member.roles.add(roleId);
            await user.send(`✅ Cargo <@&${roleId}> **adicionado**! Você será notificado quando houver novidades sobre **${eventKey}**.`).catch(() => null);
        } catch (err) {
            console.error('[NEWS_ROLE]', err.message);
            await user.send('❌ Não consegui adicionar seu cargo. Verifique se o bot tem permissão para gerenciar cargos.').catch(() => null);
        }
    },
};
