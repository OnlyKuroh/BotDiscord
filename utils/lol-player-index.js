const axios = require('axios');
const db = require('./db');
const { getLatestDataDragonVersion, getProfileIconUrl } = require('./lol-assets');

const RIOT_KEY = process.env.RIOT_API_KEY || '';
const KNOWN_PLAYER_PREFIX = 'lol_known_player_';
const INDEX_META_KEY = 'lol_player_index_meta';
const INDEX_INTERVAL_MS = 12 * 60 * 60 * 1000;

let indexTimer = null;

function normalizeSearchText(value) {
    return String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9#\s_-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function searchKnownPlayers(prefix) {
    const normalized = normalizeSearchText(prefix);
    if (!normalized) return [];

    const knownPlayers = db.getEntriesByPrefix('lol_known_player_')
        .map((entry) => entry.value);

    const trackedPlayers = db.getEntriesByPrefix('lol_dm_tracker_')
        .map((entry) => entry.value)
        .map((tracker) => ({
            riotId: tracker?.riotId,
            gameName: tracker?.gameName,
            tagLine: tracker?.tagLine,
            regiao: tracker?.regiao,
            level: tracker?.level || null,
            rankText: tracker?.rankText || null,
            iconUrl: tracker?.profileIconUrl || null,
            updatedAt: tracker?.updatedAt || tracker?.createdAt || null,
        }));

    const deduped = new Map();
    for (const player of [...knownPlayers, ...trackedPlayers]) {
        if (!player?.riotId) continue;
        deduped.set(String(player.riotId).toLowerCase(), player);
    }

    const queryParts = normalized.split(' ').filter(Boolean);

    return [...deduped.values()]
        .map((player) => {
            const gameName = normalizeSearchText(player?.gameName);
            const riotId = normalizeSearchText(player?.riotId);
            const tagLine = normalizeSearchText(player?.tagLine);
            const combined = [gameName, riotId, tagLine].filter(Boolean).join(' ');
            const words = combined.split(' ').filter(Boolean);

            let score = 0;
            if (gameName.startsWith(normalized) || riotId.startsWith(normalized)) score += 100;
            if (words.some((word) => word.startsWith(normalized))) score += 60;
            if (combined.includes(normalized)) score += 30;
            if (queryParts.every((part) => combined.includes(part))) score += 15;

            return { player, score };
        })
        .filter((entry) => entry.score > 0)
        .sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            return String(b.player.updatedAt || '').localeCompare(String(a.player.updatedAt || ''));
        })
        .map((entry) => entry.player)
        .slice(0, 10);
}
let indexRunning = false;

function getRouting(regiao) {
    if (['br1', 'la1', 'la2', 'na1', 'oc1'].includes(regiao)) return 'americas';
    if (['kr', 'jp1'].includes(regiao)) return 'asia';
    if (['ph2', 'sg2', 'th2', 'tw2', 'vn2'].includes(regiao)) return 'sea';
    return 'europe';
}

function normalizeRiotId(gameName, tagLine) {
    return `${String(gameName || '').trim()}#${String(tagLine || '').trim()}`;
}

function pickBestRankText(entries = []) {
    const queues = [
        entries.find((entry) => entry.queueType === 'RANKED_SOLO_5x5'),
        entries.find((entry) => entry.queueType === 'RANKED_FLEX_SR'),
    ].filter(Boolean);

    const first = queues[0];
    if (!first) return 'Sem rank';
    return `${first.tier} ${first.rank} - ${first.leaguePoints}LP`;
}

function upsertKnownPlayer(player) {
    const riotId = normalizeRiotId(player?.gameName, player?.tagLine);
    if (!player?.gameName || !player?.tagLine || !riotId || riotId === '#') return null;

    const key = `${KNOWN_PLAYER_PREFIX}${riotId.toLowerCase()}`;
    const current = db.get(key) || {};
    const next = {
        ...current,
        riotId,
        updatedAt: new Date().toISOString(),
    };
    // Só sobrescreve campos não-nulos (evita apagar elo/level com null de indexMatchParticipants)
    for (const [k, v] of Object.entries(player)) {
        if (v !== null && v !== undefined) next[k] = v;
    }

    db.set(key, next);
    return next;
}

function rememberKnownPlayer(player) {
    return upsertKnownPlayer(player);
}

function indexMatchParticipants(matches = [], regiao = 'br1') {
    for (const match of matches) {
        const participants = match?.info?.participants || [];
        for (const participant of participants) {
            const gameName = participant.riotIdGameName || participant.gameName || null;
            const tagLine = participant.riotIdTagline || participant.tagLine || null;
            if (!gameName || !tagLine) continue;

            upsertKnownPlayer({
                gameName,
                tagLine,
                regiao,
                puuid: participant.puuid || null,
                level: null,
                rankText: null,
                iconUrl: null,
            });
        }
    }
}

async function seedBrTopLadders(limitPerBucket = 10) {
    if (!RIOT_KEY) return;
    if (indexRunning) return;

    indexRunning = true;
    try {
        const riotHeaders = { headers: { 'X-Riot-Token': RIOT_KEY } };
        const patchVersion = await getLatestDataDragonVersion();
        const queues = ['RANKED_SOLO_5x5', 'RANKED_FLEX_SR'];
        const topLeagueBuckets = ['challengerleagues', 'grandmasterleagues', 'masterleagues'];
        let indexedCount = 0;

        for (const queue of queues) {
            for (const tier of topLeagueBuckets) {
                const leagueRes = await axios.get(
                    `https://br1.api.riotgames.com/lol/league/v4/${tier}/by-queue/${queue}`,
                    riotHeaders
                ).catch(() => null);

                const entries = Array.isArray(leagueRes?.data?.entries)
                    ? leagueRes.data.entries.slice(0, limitPerBucket)
                    : [];

                for (const entry of entries) {
                    const inserted = await enrichLeagueEntry(entry, patchVersion, riotHeaders);
                    if (inserted) indexedCount += 1;
                }
            }
        }

        if (indexedCount === 0) {
            const fallbackEntries = await seedFromLeagueExp(patchVersion, riotHeaders, limitPerBucket);
            indexedCount += fallbackEntries;
        }

        db.set(INDEX_META_KEY, {
            lastSeedAt: new Date().toISOString(),
            region: 'br1',
            mode: 'ladder_seed',
            indexedCount,
        });
    } catch (error) {
        console.error('[LOL PLAYER INDEX] Falha ao semear ladder BR:', error.message);
    } finally {
        indexRunning = false;
    }
}

async function enrichLeagueEntry(entry, patchVersion, riotHeaders) {
    let puuid = entry?.puuid || null;
    let summoner = null;

    if (entry?.summonerId) {
        summoner = await axios.get(
            `https://br1.api.riotgames.com/lol/summoner/v4/summoners/${entry.summonerId}`,
            riotHeaders
        ).catch(() => null);
        puuid = puuid || summoner?.data?.puuid || null;
    }

    if (!puuid) return false;

    if (!summoner) {
        summoner = await axios.get(
            `https://br1.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${puuid}`,
            riotHeaders
        ).catch(() => null);
    }

    const account = await axios.get(
        `https://americas.api.riotgames.com/riot/account/v1/accounts/by-puuid/${puuid}`,
        riotHeaders
    ).catch(() => null);
    if (!account?.data?.gameName || !account?.data?.tagLine) return false;

    upsertKnownPlayer({
        gameName: account.data.gameName,
        tagLine: account.data.tagLine,
        regiao: 'br1',
        puuid,
        summonerId: summoner?.data?.id || entry.summonerId || null,
        level: summoner?.data?.summonerLevel || null,
        rankText: `${entry.tier} ${entry.rank} - ${entry.leaguePoints}LP`,
        iconUrl: summoner?.data?.profileIconId ? getProfileIconUrl(patchVersion, summoner.data.profileIconId) : null,
    });
    return true;
}

async function seedFromLeagueExp(patchVersion, riotHeaders, limitPerBucket) {
    const queues = ['RANKED_SOLO_5x5', 'RANKED_FLEX_SR'];
    const tiers = ['DIAMOND', 'EMERALD', 'PLATINUM', 'GOLD'];
    const divisions = ['I', 'II'];
    let indexedCount = 0;

    for (const queue of queues) {
        for (const tier of tiers) {
            for (const division of divisions) {
                const expRes = await axios.get(
                    `https://br1.api.riotgames.com/lol/league-exp/v4/entries/${queue}/${tier}/${division}`,
                    {
                        ...riotHeaders,
                        params: { page: 1 },
                    }
                ).catch(() => null);

                const entries = Array.isArray(expRes?.data) ? expRes.data.slice(0, limitPerBucket) : [];
                for (const entry of entries) {
                    const inserted = await enrichLeagueEntry(entry, patchVersion, riotHeaders);
                    if (inserted) indexedCount += 1;
                }
            }
        }
    }

    return indexedCount;
}

function start() {
    if (!RIOT_KEY || indexTimer) return;
    void seedBrTopLadders();
    indexTimer = setInterval(() => {
        void seedBrTopLadders();
    }, INDEX_INTERVAL_MS);
}

module.exports = {
    KNOWN_PLAYER_PREFIX,
    getRouting,
    pickBestRankText,
    rememberKnownPlayer,
    upsertKnownPlayer,
    indexMatchParticipants,
    seedBrTopLadders,
    start,
    searchKnownPlayers,
};
