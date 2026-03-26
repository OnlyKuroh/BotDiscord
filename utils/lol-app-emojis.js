const db = require('./db');
const {
    getChampionSquareUrl,
    getRankMiniIconUrl,
    getRoleIconUrl,
} = require('./lol-assets');

const EMOJI_CACHE_PREFIX = 'lol_app_emoji_';
const MAX_EMOJI_NAME = 32;
const APPLICATION_EMOJI_CACHE = new Map();
const APPLICATION_EMOJI_TTL_MS = 5 * 60 * 1000;

function sanitizeEmojiName(value) {
    return String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9_]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, MAX_EMOJI_NAME) || 'lol_asset';
}

async function ensureApplication(client) {
    if (!client?.application) {
        return null;
    }

    if (!client.application.id) {
        await client.application.fetch().catch(() => null);
    }

    return client.application || null;
}

async function getApplicationEmojiCollection(application) {
    if (!application?.id) {
        return null;
    }

    const cached = APPLICATION_EMOJI_CACHE.get(application.id);
    if (cached?.collection && (Date.now() - cached.cachedAt) < APPLICATION_EMOJI_TTL_MS) {
        return cached.collection;
    }

    try {
        const collection = await application.emojis.fetch();
        APPLICATION_EMOJI_CACHE.set(application.id, { collection, cachedAt: Date.now() });
        return collection;
    } catch (err) {
        console.warn('[LOL-EMOJI] Falha ao buscar coleção de emojis:', err?.message || err);
        return null;
    }
}


function cacheKey(kind, name) {
    return `${EMOJI_CACHE_PREFIX}${kind}_${sanitizeEmojiName(name)}`;
}

async function resolveCachedEmoji(application, storedId) {
    if (!application || !storedId) {
        return null;
    }

    const inCache = application.emojis.cache.get(storedId);
    if (inCache) {
        return inCache;
    }

    return application.emojis.fetch(storedId).catch(() => null);
}

async function ensureEmoji(application, kind, rawName, attachmentUrl) {
    if (!application || !attachmentUrl) {
        return '';
    }

    const safeName = sanitizeEmojiName(`lol_${kind}_${rawName}`);
    const key = cacheKey(kind, rawName);
    const stored = db.get(key);

    if (stored?.id) {
        const cachedEmoji = await resolveCachedEmoji(application, stored.id);
        if (cachedEmoji) {
            return cachedEmoji.toString();
        }
    }

    const knownEmojis = await getApplicationEmojiCollection(application);
    const existing = knownEmojis?.find((emoji) => emoji.name === safeName) || null;
    if (existing) {
        db.set(key, { id: existing.id, name: existing.name });
        return existing.toString();
    }

    try {
        const created = await application.emojis.create({
            image: attachmentUrl,
            name: safeName,
        });
        db.set(key, { id: created.id, name: created.name });
        APPLICATION_EMOJI_CACHE.delete(application.id); // força refresh do cache na próxima chamada
        console.log(`[LOL-EMOJI] Criado emoji "${safeName}"`);
        return created.toString();
    } catch (err) {
        const raw = err?.rawError ? JSON.stringify(err.rawError) : '';
        console.warn(`[LOL-EMOJI] Falha ao criar "${safeName}": ${err?.message || err} ${raw}`);
        return '';
    }
}

async function getTierEmoji(client, tier) {
    if (!tier || String(tier).toUpperCase() === 'UNRANKED') {
        return '';
    }

    const application = await ensureApplication(client);
    return ensureEmoji(application, 'tier', tier, getRankMiniIconUrl(tier));
}

async function getRoleEmoji(client, role) {
    if (!role) {
        return '';
    }

    const application = await ensureApplication(client);
    return ensureEmoji(application, 'role', role, getRoleIconUrl(role));
}

async function getChampionEmoji(client, version, championId) {
    if (!championId) {
        return '';
    }

    const application = await ensureApplication(client);
    return ensureEmoji(application, 'champ', championId, getChampionSquareUrl(version, championId));
}

module.exports = {
    getTierEmoji,
    getRoleEmoji,
    getChampionEmoji,
};
