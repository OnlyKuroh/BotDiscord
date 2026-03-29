const axios = require('axios');
const fs = require('fs');
const path = require('path');

const DEFAULT_DDRAGON_VERSION = '15.1.1';

// ─── Assets locais ────────────────────────────────────────────────────────────
// Baixados por scripts/download-lol-assets.js, servidos pelo Express em /lol-assets
// Se o arquivo não existir localmente, cai no CDragon como fallback
const LOCAL_ASSETS_DIR = path.join(__dirname, '..', 'assets', 'lol');
const LOCAL_BASE_URL = 'http://localhost:3001/lol-assets';

function localExists(subPath) {
    return fs.existsSync(path.join(LOCAL_ASSETS_DIR, subPath));
}

function localUrl(subPath) {
    return `${LOCAL_BASE_URL}/${subPath}`;
}
const RUNE_CACHE = new Map();
const RUNE_CATALOG_CACHE = new Map();
const ITEM_CACHE = new Map();
const SUMMONER_CACHE = new Map();
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

function normalizeAssetLookup(value) {
    return String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function getChampionSplashUrl(championId, skinNum = 0) {
    return `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${championId}_${skinNum}.jpg`;
}

function getChampionSquareUrl(version, championId) {
    if (localExists(`champions/${championId}.png`)) return localUrl(`champions/${championId}.png`);
    return `https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${championId}.png`;
}

function getChampionNumericIconUrl(championNumericId) {
    return `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-icons/${championNumericId}.png`;
}

function getItemIconUrl(itemId) {
    return `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/items/icons2d/${itemId}.png`;
}

// primeira declaração removida — substituída abaixo

// Emblema de rank grande (Iron → Challenger + Unranked)
// Local: assets/lol/ranks/<tier>.png | Fallback: CDragon
function getRankEmblemUrl(tier) {
    const t = String(tier || 'unranked').toLowerCase();
    if (localExists(`ranks/${t}.png`)) return localUrl(`ranks/${t}.png`);
    return `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/content/img/ranked-emblems/emblem-${t}.png`;
}

// Mini crest de rank (para campos inline)
// Local: assets/lol/ranks-mini/<tier>.png | Fallback: CDragon
function getRankMiniIconUrl(tier) {
    const t = String(tier || 'unranked').toLowerCase();
    if (localExists(`ranks-mini/${t}.png`)) return localUrl(`ranks-mini/${t}.png`);
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
// Local: assets/lol/runes/<basename>.png | Fallback: DDragon CDN
function getRuneIconDDragonUrl(iconRelativePath) {
    if (!iconRelativePath) return null;
    const fileName = iconRelativePath.split('/').pop();
    if (fileName && localExists(`runes/${fileName}`)) return localUrl(`runes/${fileName}`);
    return `https://ddragon.leagueoflegends.com/cdn/img/${iconRelativePath}`;
}

// Ícone de posição/lane
// Local: assets/lol/lanes/<lane>.png | Fallback: CDragon
function getRoleIconUrl(role) {
    const normalized = String(role || '')
        .toLowerCase()
        .replace('support', 'utility')
        .replace('mid', 'middle')
        .replace('adc', 'bottom')
        .replace('fill', 'unselected');
    if (localExists(`lanes/${normalized}.png`)) return localUrl(`lanes/${normalized}.png`);
    return `https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-clash/global/default/assets/images/position-selector/positions/icon-position-${normalized}.png`;
}

// Ícone de summoner spell pelo ID (ex: "SummonerFlash") ou pelo fullImageName (ex: "SummonerFlash.png")
// Local: assets/lol/spells/<name>.png | Fallback: CDragon
function getSummonerSpellIconUrl(spellId) {
    const name = String(spellId || '');
    const fileName = name.endsWith('.png') ? name : `${name}.png`;
    if (localExists(`spells/${fileName}`)) return localUrl(`spells/${fileName}`);
    return `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/summoner-spells/icons2d/${name.toLowerCase()}.png`;
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

// Ícone de maestria por nível (1–10)
// Local: assets/lol/mastery/<level>.png | Fallback: CDragon
function getMasteryIconUrl(level) {
    const capped = Math.min(Math.max(level || 1, 1), 10);
    if (localExists(`mastery/${capped}.png`)) return localUrl(`mastery/${capped}.png`);
    return `https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-shared-components/global/default/images/champion-mastery/mastery-${capped}.png`;
}

// Ícone de honra por nível (0–5)
// Local: assets/lol/honor/<level>.png | Fallback: CDragon (caminho 2026)
// Nível 0 = emblem_0.png | Níveis 1-5 = emblem_level_{n}.png
function getHonorIconUrl(level) {
    const capped = Math.min(Math.max(level || 0, 0), 5);
    if (localExists(`honor/${capped}.png`)) return localUrl(`honor/${capped}.png`);
    const fileName = capped === 0 ? 'emblem_0' : `emblem_level_${capped}`;
    return `https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/honor/profile/${fileName}.png`;
}

// Meraki Analytics: dados de campeão (winrate, pickrate, tier por role)
function getMerakiChampionUrl(championId) {
    return `https://cdn.merakianalytics.com/riot/lol/resources/latest/en-US/champions/${championId}.json`;
}

// Alias: spell pelo key (ex: "SummonerFlash") — usa mesma lógica de getSummonerSpellIconUrl
function getSummonerSpellByKeyUrl(spellKey) {
    return getSummonerSpellIconUrl(spellKey);
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

async function getItemCatalog(version, locale = 'pt_BR') {
    const cacheKey = `${version}:${locale}`;
    const cached = ITEM_CACHE.get(cacheKey);
    if (cached && (Date.now() - cached.cachedAt) < CACHE_TTL_MS) {
        return cached.data;
    }

    try {
        const response = await axios.get(
            `https://ddragon.leagueoflegends.com/cdn/${version}/data/${locale}/item.json`,
            { timeout: 8000 }
        );

        const entries = Object.entries(response.data?.data || {})
            .map(([id, item]) => ({
                id,
                name: item.name,
                normalizedName: normalizeAssetLookup(item.name),
                description: item.description || '',
                tags: Array.isArray(item.tags) ? item.tags : [],
                maps: item.maps || {},
                purchasable: item.gold?.purchasable !== false,
            }))
            .filter((item) => item.name)
            .filter((item) => item.purchasable && item.maps?.['11'] !== false);

        ITEM_CACHE.set(cacheKey, { data: entries, cachedAt: Date.now() });
        return entries;
    } catch {
        return cached?.data || [];
    }
}

async function getSummonerSpellCatalog(version, locale = 'pt_BR') {
    const cacheKey = `${version}:${locale}`;
    const cached = SUMMONER_CACHE.get(cacheKey);
    if (cached && (Date.now() - cached.cachedAt) < CACHE_TTL_MS) {
        return cached.data;
    }

    try {
        const response = await axios.get(
            `https://ddragon.leagueoflegends.com/cdn/${version}/data/${locale}/summoner.json`,
            { timeout: 8000 }
        );

        const entries = Object.values(response.data?.data || {})
            .map((spell) => ({
                id: spell.id,
                key: spell.key,
                name: spell.name,
                normalizedName: normalizeAssetLookup(spell.name),
                description: spell.description || '',
            }))
            .filter((spell) => spell.name);

        SUMMONER_CACHE.set(cacheKey, { data: entries, cachedAt: Date.now() });
        return entries;
    } catch {
        return cached?.data || [];
    }
}

async function getRuneCatalog(version, locale = 'pt_BR') {
    const cacheKey = `${version}:${locale}`;
    const cached = RUNE_CATALOG_CACHE.get(cacheKey);
    if (cached && (Date.now() - cached.cachedAt) < CACHE_TTL_MS) {
        return cached.data;
    }

    const tryLocales = [locale, 'en_US'].filter((value, index, list) => value && list.indexOf(value) === index);

    for (const currentLocale of tryLocales) {
        try {
            const response = await axios.get(
                `https://ddragon.leagueoflegends.com/cdn/${version}/data/${currentLocale}/runesReforged.json`,
                { timeout: 8000 }
            );

            const entries = [];
            for (const style of (response.data || [])) {
                entries.push({
                    id: String(style.id),
                    name: style.name,
                    normalizedName: normalizeAssetLookup(style.name),
                });

                for (const slot of (style.slots || [])) {
                    for (const rune of (slot.runes || [])) {
                        entries.push({
                            id: String(rune.id),
                            name: rune.name,
                            normalizedName: normalizeAssetLookup(rune.name),
                        });
                    }
                }
            }

            const deduped = entries.filter((entry, index, list) =>
                entry.name && list.findIndex((candidate) => candidate.name === entry.name) === index
            );

            RUNE_CATALOG_CACHE.set(cacheKey, { data: deduped, cachedAt: Date.now() });
            return deduped;
        } catch {
            continue;
        }
    }

    return cached?.data || [];
}

module.exports = {
    getLatestDataDragonVersion,
    getChampionCatalog,
    getItemCatalog,
    getRuneCatalog,
    getSummonerSpellCatalog,
    normalizeAssetLookup,
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
    getHonorIconUrl,
};
