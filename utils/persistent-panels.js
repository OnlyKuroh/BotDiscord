const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { EmbedBuilder } = require('discord.js');
const db = require('./db');

const dataDir = path.join(__dirname, '..', 'data');
const uploadsDir = path.join(dataDir, 'uploads');

const NEWS_REACTIONS = [
    { key: 'anime', emoji: '🎌', label: 'Anime' },
    { key: 'noticias', emoji: '📰', label: 'Noticias' },
    { key: 'politica_br', emoji: '🏛️', label: 'Politica BR' },
    { key: 'politica_mun', emoji: '🌍', label: 'Politica Mundial' },
    { key: 'ia_news', emoji: '🤖', label: 'IA News' },
    { key: 'financeiro', emoji: '💹', label: 'Financeiro' },
    { key: 'cotacao', emoji: '💱', label: 'Cotacoes' },
    { key: 'google_news', emoji: '🔍', label: 'Google News' },
    { key: 'horoscopo', emoji: '♈', label: 'Horoscopo' },
    { key: 'steam', emoji: '🎮', label: 'Steam' },
    { key: 'eleicao', emoji: '🗳️', label: 'Eleicoes' },
];

function ensureUploadsDir() {
    if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
    }
}

function getPublicBaseUrl() {
    const direct = process.env.BOT_PUBLIC_URL
        || process.env.PUBLIC_BOT_URL
        || process.env.BACKEND_PUBLIC_URL
        || '';
    if (direct) return direct.replace(/\/$/, '');

    const oauthRedirect = process.env.OAUTH_REDIRECT_URI || '';
    if (oauthRedirect) {
        try {
            return new URL(oauthRedirect).origin;
        } catch {}
    }

    return `http://localhost:${process.env.PORT || 3001}`;
}

function normalizeManagedImageUrl(url) {
    const raw = String(url || '').trim();
    if (!raw) return null;

    const baseUrl = getPublicBaseUrl();

    if (raw.startsWith('/uploads/')) {
        return `${baseUrl}${raw}`;
    }

    if (raw.includes('/uploads/')) {
        try {
            const parsed = new URL(raw);
            return `${baseUrl}${parsed.pathname}`;
        } catch {}
    }

    return raw;
}

function isDiscordAttachmentUrl(url) {
    return /(?:cdn|media)\.discordapp\.(?:com|net)\/attachments\//i.test(String(url || ''));
}

function isManagedUploadUrl(url) {
    return /\/uploads\//i.test(String(url || ''));
}

async function isImageUrlHealthy(url) {
    const target = normalizeManagedImageUrl(url);
    if (!target) return false;

    try {
        const response = await axios.head(target, {
            timeout: 8000,
            maxRedirects: 3,
            validateStatus: () => true,
        });

        if (response.status >= 200 && response.status < 400) {
            return true;
        }

        if (response.status === 405 || response.status === 403) {
            const fallback = await axios.get(target, {
                timeout: 8000,
                responseType: 'stream',
                maxRedirects: 3,
                validateStatus: () => true,
            });
            fallback.data.destroy?.();
            return fallback.status >= 200 && fallback.status < 400;
        }
    } catch {
        return false;
    }

    return false;
}

function sanitizeFileName(name) {
    return String(name || 'asset').replace(/[^a-z0-9._-]/gi, '-').replace(/-+/g, '-');
}

function detectExtension(url, contentType = '') {
    const fromType = String(contentType || '').toLowerCase();
    if (fromType.includes('png')) return '.png';
    if (fromType.includes('gif')) return '.gif';
    if (fromType.includes('webp')) return '.webp';
    if (fromType.includes('jpeg') || fromType.includes('jpg')) return '.jpg';

    try {
        const pathname = new URL(url).pathname;
        const ext = path.extname(pathname);
        return ext || '.png';
    } catch {
        return '.png';
    }
}

async function mirrorImageToUploads(url, prefix = 'asset') {
    const target = normalizeManagedImageUrl(url);
    if (!target) return null;
    if (isManagedUploadUrl(target)) return target;

    ensureUploadsDir();

    const response = await axios.get(target, {
        timeout: 15000,
        responseType: 'arraybuffer',
        maxRedirects: 3,
    });

    const extension = detectExtension(target, response.headers?.['content-type']);
    const fileName = sanitizeFileName(`${prefix}-${Date.now()}${extension}`);
    const filePath = path.join(uploadsDir, fileName);
    fs.writeFileSync(filePath, Buffer.from(response.data));

    return `${getPublicBaseUrl()}/uploads/${fileName}`;
}

async function prepareWelcomeBannerUrl(url, guildId = 'global') {
    const normalized = normalizeManagedImageUrl(url);
    if (!normalized) return null;

    if (isManagedUploadUrl(normalized)) {
        return normalized;
    }

    if (isDiscordAttachmentUrl(normalized)) {
        try {
            return await mirrorImageToUploads(normalized, `welcome-${guildId}`);
        } catch {
            return normalized;
        }
    }

    return normalized;
}

async function resolveWelcomeBannerForGuild(guild, welcomeData = {}) {
    const current = normalizeManagedImageUrl(welcomeData.bannerUrl);
    if (current && await isImageUrlHealthy(current)) {
        return current;
    }

    const fallbackGuild = await guild.fetch().catch(() => guild);
    return fallbackGuild.bannerURL?.({ size: 2048, extension: 'png' })
        || fallbackGuild.splashURL?.({ size: 2048, extension: 'png' })
        || fallbackGuild.iconURL?.({ size: 1024, extension: 'png' })
        || null;
}

function getActiveNewsReactions(guildId) {
    const eventsConfig = db.get(`events_${guildId}`) || {};
    return NEWS_REACTIONS.filter((entry) => eventsConfig[entry.key]?.enabled && eventsConfig[entry.key]?.roleId);
}

function buildVerifyPanelEmbed(client, guildId) {
    const config = db.get(`verify_config_${guildId}`) || {};
    const roleId = db.get(`verify_role_${guildId}`) || null;
    const keyword = config.keyword || 'verificar';

    const embed = new EmbedBuilder()
        .setColor('#C41230')
        .setAuthor({ name: 'Seguranca do Dominio', iconURL: client.user?.displayAvatarURL() || undefined })
        .setTitle('🔐 Verificacao Necessaria')
        .setDescription(config.message || `Bem-vindo ao servidor. Para liberar os canais, digite **${keyword}** neste chat.`)
        .addFields(
            { name: '📝 Palavra-chave', value: `\`${keyword}\``, inline: true },
            { name: '🎭 Cargo principal', value: roleId ? `<@&${roleId}>` : 'Nao configurado', inline: true },
        )
        .setThumbnail(client.user?.displayAvatarURL() || null)
        .setFooter({ text: 'Digite a palavra-chave abaixo para ser verificado' })
        .setTimestamp();

    return embed;
}

function buildNewsPanelEmbed(client, guildId) {
    const activeReactions = getActiveNewsReactions(guildId);
    const eventsConfig = db.get(`events_${guildId}`) || {};
    const panelConfig = db.get(`news_panel_config_${guildId}`) || {};

    const descLines = activeReactions.map((entry) => {
        const conf = eventsConfig[entry.key];
        return `${entry.emoji} **${entry.label}** → <@&${conf.roleId}>`;
    });

    return new EmbedBuilder()
        .setColor(panelConfig.customColor || '#2b2d31')
        .setAuthor({ name: 'Central de Noticias', iconURL: client.user?.displayAvatarURL() || undefined })
        .setTitle(panelConfig.customTitle || '📢 Inscreva-se nas Noticias')
        .setDescription(
            `${panelConfig.customDesc || 'Reaja com os emojis abaixo para receber ou remover notificacoes de cada categoria.'}\n\n${descLines.join('\n')}`
        )
        .setThumbnail(client.user?.displayAvatarURL() || null)
        .setFooter({ text: 'Reaja novamente para remover • Engrenagem Itadori' });
}

async function findRecentBotPanelMessage(channel, matcher) {
    const messages = await channel.messages.fetch({ limit: 30 }).catch(() => null);
    if (!messages) return null;

    return messages.find((message) => {
        if (message.author?.id !== channel.client.user.id) return false;
        return matcher(message);
    }) || null;
}

async function findRecentBotPanelMessages(channel, matcher, limit = 40) {
    const messages = await channel.messages.fetch({ limit }).catch(() => null);
    if (!messages) return [];

    return [...messages.values()].filter((message) => {
        if (message.author?.id !== channel.client.user.id) return false;
        return matcher(message);
    });
}

async function deletePanelMessages(messages = []) {
    for (const message of messages) {
        await message.delete().catch(() => null);
    }
}

async function ensureVerificationPanel(client, guildId) {
    const channelId = db.get(`verify_channel_${guildId}`);
    if (!channelId) return null;

    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel?.isTextBased?.()) return null;

    const embed = buildVerifyPanelEmbed(client, guildId);
    const trackedMessageId = db.get(`verify_message_${guildId}`) || null;
    const staleMessages = await findRecentBotPanelMessages(channel, (message) =>
        message.id === trackedMessageId
        || message.embeds?.[0]?.title?.includes('Verificacao')
        || message.embeds?.[0]?.author?.name?.includes('Seguranca do Dominio')
    );

    await deletePanelMessages(staleMessages);

    const created = await channel.send({ embeds: [embed] }).catch(() => null);
    if (created) {
        db.set(`verify_message_${guildId}`, created.id);
    }
    return created;
}

async function ensureNewsPanel(client, guildId) {
    const channelId = db.get(`news_panel_channel_${guildId}`);
    if (!channelId) return null;

    const activeReactions = getActiveNewsReactions(guildId);
    if (!activeReactions.length) return null;

    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel?.isTextBased?.()) return null;

    const embed = buildNewsPanelEmbed(client, guildId);
    const trackedMessageId = db.get(`news_panel_message_${guildId}`) || null;
    const staleMessages = await findRecentBotPanelMessages(channel, (message) =>
        message.id === trackedMessageId
        || message.embeds?.[0]?.title?.includes('Noticias')
        || message.embeds?.[0]?.author?.name?.includes('Central de Noticias')
    );

    await deletePanelMessages(staleMessages);

    const targetMessage = await channel.send({ embeds: [embed] }).catch(() => null);

    if (!targetMessage) return null;

    db.set(`news_panel_message_${guildId}`, targetMessage.id);

    for (const entry of activeReactions) {
        const alreadyThere = targetMessage.reactions.cache.find((reaction) => reaction.emoji.name === entry.emoji);
        if (!alreadyThere) {
            await targetMessage.react(entry.emoji).catch(() => null);
        }
    }

    return targetMessage;
}

async function repairWelcomeConfigMedia(client, guildId) {
    const guild = client.guilds.cache.get(guildId);
    const welcomeData = db.get(`welcome_${guildId}`);
    if (!guild || !welcomeData?.bannerUrl) return null;

    const original = welcomeData.bannerUrl;
    const prepared = await prepareWelcomeBannerUrl(original, guildId);
    const resolved = await resolveWelcomeBannerForGuild(guild, { bannerUrl: prepared || original });

    if (prepared && prepared !== original) {
        db.set(`welcome_${guildId}`, { ...welcomeData, bannerUrl: prepared });
        db.addLog('WELCOME_MEDIA_FIX', `Banner de welcome migrado para URL estavel em ${guild.name}.`, guildId, null, 'Persistent Panels');
        return prepared;
    }

    if (!resolved) {
        db.set(`welcome_${guildId}`, { ...welcomeData, bannerUrl: null });
        db.addLog('WELCOME_MEDIA_FIX', `Banner de welcome removido por URL quebrada em ${guild.name}.`, guildId, null, 'Persistent Panels');
        return null;
    }

    if (resolved !== original) {
        db.set(`welcome_${guildId}`, { ...welcomeData, bannerUrl: resolved });
        db.addLog('WELCOME_MEDIA_FIX', `Banner de welcome atualizado com fallback de guild em ${guild.name}.`, guildId, null, 'Persistent Panels');
        return resolved;
    }

    return resolved;
}

async function reconcilePersistentArtifacts(client) {
    for (const guild of client.guilds.cache.values()) {
        await repairWelcomeConfigMedia(client, guild.id).catch(() => null);
        await ensureVerificationPanel(client, guild.id).catch(() => null);
        await ensureNewsPanel(client, guild.id).catch(() => null);
    }
}

module.exports = {
    NEWS_REACTIONS,
    normalizeManagedImageUrl,
    prepareWelcomeBannerUrl,
    resolveWelcomeBannerForGuild,
    buildVerifyPanelEmbed,
    buildNewsPanelEmbed,
    ensureVerificationPanel,
    ensureNewsPanel,
    reconcilePersistentArtifacts,
};
