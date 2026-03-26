const axios = require('axios');

const DEFAULT_DDRAGON_VERSION = '15.1.1';
const RUNE_CACHE = new Map();
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

// CDragon path confirmado: content/img/ranked-emblems/
function getRankEmblemUrl(tier) {
    const t = String(tier || 'unranked').toLowerCase();
    return `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/content/img/ranked-emblems/emblem-${t}.png`;
}

function getRankMiniIconUrl(tier) {
    const t = String(tier || 'unranked').toLowerCase();
    return `https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/ranked-mini-crests/${t}.png`;
}

// Converte iconPath do CDragon JSON para URL pública
// Ex: "/lol-game-data/assets/v1/perk-images/Styles/Precision/Conqueror/Conqueror.png"
// -> "https://raw.communitydragon.org/.../v1/perk-images/styles/precision/conqueror/conqueror.png"
function cdragonIconPathToUrl(iconPath) {
    if (!iconPath) return null;
    const cleaned = iconPath.replace('/lol-game-data/assets', '').toLowerCase();
    return `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default${cleaned}`;
}

// DDragon: ícone de runa via campo "icon" do runesReforged.json
function getRuneIconDDragonUrl(iconRelativePath) {
    if (!iconRelativePath) return null;
    return `https://ddragon.leagueoflegends.com/cdn/img/${iconRelativePath}`;
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

// CommunityDragon: ícone de summoner spell pelo ID numérico
function getSummonerSpellIconUrl(spellId) {
    return `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/summoner-spells/icons2d/${spellId}.png`;
}

// CommunityDragon: ícone de runa/perk pelo ID numérico
function getRuneIconUrl(runeId) {
    return `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/perk-images/styles/${runeId}.png`;
}

// CommunityDragon: ícone de runa keystone
function getKeyStoneIconUrl(perkId) {
    return `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/perk-images/styles/keystones/${perkId}.png`;
}

// CommunityDragon: ícone de item
function getItemIconUrl(itemId) {
    return `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/items/icons2d/${itemId}.png`;
}

// CommunityDragon: banner de perfil (profile-banner) do jogador
// Usa o profileIconId para buscar um banner de background temático
function getProfileBannerUrl(puuid) {
    // CommunityDragon profile backgrounds — usamos splash do campeão principal como fallback
    // Riot não expõe banner individual via API pública; retorna null para usar splash
    return null;
}

// CommunityDragon: ícone de maestria por nível
function getMasteryIconUrl(level) {
    const capped = Math.min(Math.max(level || 1, 1), 10);
    return `https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-shared-components/global/default/images/champion-mastery/mastery-${capped}.png`;
}

// Meraki Analytics: dados de campeão (winrate, pickrate, tier por role)
function getMerakiChampionUrl(championId) {
    return `https://cdn.merakianalytics.com/riot/lol/resources/latest/en-US/champions/${championId}.json`;
}

// CommunityDragon: ícone de summoner spell pelo key (nome, ex: "SummonerFlash")
function getSummonerSpellByKeyUrl(spellKey) {
    return `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/summoner-spells/icons2d/${String(spellKey || '').toLowerCase()}.png`;
}

// Busca e cacheia o mapa de runas: id -> iconPath URL
async function getRuneIconMap(version) {
    const cached = RUNE_CACHE.get(version);
    if (cached && (Date.now() - cached.cachedAt) < CACHE_TTL_MS) return cached.data;

    try {
        const res = await axios.get(
            `https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/runesReforged.json`,
            { timeout: 8000 }
        );
        const map = new Map();
        for (const style of (res.data || [])) {
            if (style.id && style.icon) map.set(style.id, getRuneIconDDragonUrl(style.icon));
            for (const slot of (style.slots || [])) {
                for (const rune of (slot.runes || [])) {
                    if (rune.id && rune.icon) map.set(rune.id, getRuneIconDDragonUrl(rune.icon));
                }
            }
        }
        RUNE_CACHE.set(version, { data: map, cachedAt: Date.now() });
        return map;
    } catch {
        return RUNE_CACHE.get(version)?.data || new Map();
    }
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
    getRuneIconMap,
    getProfileIconUrl,
    getChampionSplashUrl,
    getChampionSquareUrl,
    getChampionNumericIconUrl,
    getItemIconUrl,
    getSummonerSpellIconUrl,
    getSummonerSpellByKeyUrl,
    getRuneIconUrl,
    getKeyStoneIconUrl,
    cdragonIconPathToUrl,
    getRuneIconDDragonUrl,
    getMasteryIconUrl,
    getMerakiChampionUrl,
    getProfileBannerUrl,
    getRankEmblemUrl,
    getRankMiniIconUrl,
    getRoleIconUrl,
};
