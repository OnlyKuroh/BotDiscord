const axios = require('axios');

const DEFAULT_DDRAGON_VERSION = '15.1.1';
const DDRAGON_VERSIONS_URL = 'https://ddragon.leagueoflegends.com/api/versions.json';
const DDRAGON_REALMS_BR_URL = 'https://ddragon.leagueoflegends.com/realms/br.json';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const CHAMPION_CACHE = new Map();

let cachedVersion = null;
let cachedAt = 0;

async function getLatestDataDragonVersion() {
    if (cachedVersion && (Date.now() - cachedAt) < CACHE_TTL_MS) {
        return cachedVersion;
    }

    try {
        const [versionsRes, realmsRes] = await Promise.allSettled([
            axios.get(DDRAGON_VERSIONS_URL, { timeout: 8000 }),
            axios.get(DDRAGON_REALMS_BR_URL, { timeout: 8000 }),
        ]);

        const versions = versionsRes.status === 'fulfilled' ? versionsRes.value.data : [];
        const realmVersion = realmsRes.status === 'fulfilled' ? realmsRes.value.data?.v : null;
        const chosen = Array.isArray(versions) && versions.length > 0
            ? (realmVersion && versions.includes(realmVersion) ? realmVersion : versions[0])
            : (realmVersion || DEFAULT_DDRAGON_VERSION);

        cachedVersion = chosen;
        cachedAt = Date.now();
        return chosen;
    } catch {
        return cachedVersion || DEFAULT_DDRAGON_VERSION;
    }
}

function getProfileIconUrl(version, iconId) {
    return `https://ddragon.leagueoflegends.com/cdn/${version}/img/profileicon/${iconId}.png`;
}

function getChampionSplashUrl(championId, skinNum = 0) {
    return `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${championId}_${skinNum}.jpg`;
}

function getChampionSquareUrl(version, championId) {
    return `https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${championId}.png`;
}

function getChampionNumericIconUrl(championNumericId) {
    return `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-icons/${championNumericId}.png`;
}

function getItemIconUrl(itemId) {
    return `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/items/icons2d/${itemId}.png`;
}

function getSummonerSpellIconUrl(spellKey) {
    return `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/summoner-spells/${String(spellKey || '').toLowerCase()}.png`;
}

function getRankEmblemUrl(tier) {
    return `https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/images/ranked-emblem/emblem-${String(tier || 'unranked').toLowerCase()}.png`;
}

function getRankMiniIconUrl(tier) {
    return `https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/ranked-mini-crests/${String(tier || 'unranked').toLowerCase()}.png`;
}

function getRoleIconUrl(role) {
    const normalized = String(role || '')
        .toLowerCase()
        .replace('support', 'utility')
        .replace('mid', 'middle')
        .replace('adc', 'bottom')
        .replace('fill', 'unselected');
    return `https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-clash/global/default/assets/images/position-selector/positions/icon-position-${normalized}.png`;
}

async function getChampionCatalog(version, locale = 'pt_BR') {
    const cacheKey = `${version}:${locale}`;
    const cached = CHAMPION_CACHE.get(cacheKey);
    if (cached && (Date.now() - cached.cachedAt) < CACHE_TTL_MS) {
        return cached.data;
    }

    try {
        const response = await axios.get(
            `https://ddragon.leagueoflegends.com/cdn/${version}/data/${locale}/champion.json`,
            { timeout: 8000 }
        );
        const data = response.data?.data || {};
        CHAMPION_CACHE.set(cacheKey, { data, cachedAt: Date.now() });
        return data;
    } catch {
        return cached?.data || {};
    }
}

module.exports = {
    getLatestDataDragonVersion,
    getChampionCatalog,
    getProfileIconUrl,
    getChampionSplashUrl,
    getChampionSquareUrl,
    getChampionNumericIconUrl,
    getItemIconUrl,
    getSummonerSpellIconUrl,
    getRankEmblemUrl,
    getRankMiniIconUrl,
    getRoleIconUrl,
};
