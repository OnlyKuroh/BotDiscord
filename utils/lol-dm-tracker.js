const { EmbedBuilder } = require('discord.js');
const axios = require('axios');
const db = require('./db');
const { rememberKnownPlayer, indexMatchParticipants } = require('./lol-player-index');
const { getRiotApiKey } = require('./riot-api-key');

const RIOT_KEY = getRiotApiKey();
const CHECK_INTERVAL_MS = 2 * 60 * 1000;
const TRACKER_PREFIX = 'lol_dm_tracker_';

let trackerTimer = null;
let trackerRunning = false;

function getRouting(regiao) {
    if (['br1', 'la1', 'la2', 'na1', 'oc1'].includes(regiao)) return 'americas';
    if (['kr', 'jp1'].includes(regiao)) return 'asia';
    if (['ph2', 'sg2', 'th2', 'tw2', 'vn2'].includes(regiao)) return 'sea';
    return 'europe';
}

function trackerKey(userId, regiao, gameName, tagLine) {
    return `${TRACKER_PREFIX}${userId}_${String(regiao).toLowerCase()}_${String(gameName).toLowerCase()}_${String(tagLine).toLowerCase()}`;
}

function formatDuration(seconds) {
    const totalSeconds = Math.max(0, Math.floor(Number(seconds || 0)));
    const minutes = Math.floor(totalSeconds / 60);
    const remaining = totalSeconds % 60;
    return `${minutes}:${String(remaining).padStart(2, '0')}`;
}

function formatQueue(queueId, gameMode) {
    const queueMap = {
        420: 'Ranqueada Solo/Duo',
        440: 'Ranqueada Flex',
        450: 'ARAM',
        400: 'Normal Draft',
        430: 'Normal Blind',
        1700: 'Arena',
    };
    return queueMap[queueId] || gameMode || 'Partida';
}

function calcKDA(kills, deaths, assists) {
    return deaths === 0 ? 'Perfect' : ((kills + assists) / Math.max(1, deaths)).toFixed(2);
}

function formatNumber(value) {
    const n = Number(value || 0);
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return String(Math.round(n));
}

// ────────────────────────────────────────────────────────────────────────────
// Embed de DM: inicio da partida
// Header = assinatura do tracker
// Title = jogador que entrou em game
// Description = fila, campeao e duracao ao vivo
// Footer = shard/regiao do jogador
// ────────────────────────────────────────────────────────────────────────────
function buildTrackerStartEmbed(tracker, liveGame, me) {
    return new EmbedBuilder()
        .setColor('#e67e22')
        .setAuthor({ name: 'LoL Tracker • Partida Encontrada' })
        .setTitle(`${tracker.riotId} entrou em partida`)
        .setDescription([
            `**Fila:** ${formatQueue(liveGame.gameQueueConfigId, liveGame.gameMode)}`,
            `**Campeao:** ${me?.championName || me?.championId || 'Desconhecido'}`,
            `**Duracao atual:** ${formatDuration(Math.floor((Date.now() - liveGame.gameStartTime) / 1000))}`,
            '',
            'Vou ficar de olho e te chamar de novo quando essa partida acabar.',
        ].join('\n'))
        .setFooter({ text: `Servidor: ${String(tracker.regiao || '').toUpperCase()}` })
        .setTimestamp();
}

// ────────────────────────────────────────────────────────────────────────────
// Embed de DM: fim da partida
// Fields em 2 colunas para ficar leitura rapida:
// - farm/visao
// - dano/ouro
// - duracao
// ────────────────────────────────────────────────────────────────────────────
function buildTrackerFinishEmbed(tracker, match, participant) {
    const cs = Number(participant.totalMinionsKilled || 0) + Number(participant.neutralMinionsKilled || 0);
    const durationMinutes = Math.floor((match.info?.gameDuration || 0) / 60);
    const queue = formatQueue(match.info?.queueId, match.info?.gameMode);
    const kda = calcKDA(participant.kills, participant.deaths, participant.assists);

    return new EmbedBuilder()
        .setColor(participant.win ? '#2ecc71' : '#e74c3c')
        .setAuthor({ name: 'LoL Tracker • Partida Encerrada' })
        .setTitle(`${tracker.riotId} terminou uma partida`)
        .setDescription([
            `**Resultado:** ${participant.win ? 'Vitoria' : 'Derrota'}`,
            `**Fila:** ${queue}`,
            `**Campeao:** ${participant.championName}`,
            `**KDA:** ${participant.kills}/${participant.deaths}/${participant.assists} • ${kda}`,
        ].join('\n'))
        .addFields(
            {
                name: 'Farm e visao',
                value: `**${cs} CS** • **${participant.visionScore || 0}** de visao`,
                inline: true,
            },
            {
                name: 'Dano e ouro',
                value: `**${formatNumber(participant.totalDamageDealtToChampions || 0)}** dano • **${formatNumber(participant.goldEarned || 0)}** gold`,
                inline: true,
            },
            {
                name: 'Duracao',
                value: `**${durationMinutes} min**`,
                inline: false,
            },
        )
        .setFooter({ text: `Servidor: ${String(tracker.regiao || '').toUpperCase()}` })
        .setTimestamp();
}

function loadAllTrackers() {
    return db.getEntriesByPrefix(TRACKER_PREFIX).map((entry) => entry.value).filter((value) => value?.enabled !== false);
}

function getTracker(userId, regiao, gameName, tagLine) {
    return db.get(trackerKey(userId, regiao, gameName, tagLine)) || null;
}

function saveTracker(tracker) {
    db.set(tracker.key, {
        ...tracker,
        updatedAt: new Date().toISOString(),
    });
}

function upsertTracker({ userId, riotId, gameName, tagLine, regiao, puuid, summonerId, profileIconUrl }) {
    const key = trackerKey(userId, regiao, gameName, tagLine);
    const current = db.get(key) || {};
    const tracker = {
        key,
        userId,
        riotId,
        gameName,
        tagLine,
        regiao,
        routing: getRouting(regiao),
        puuid,
        summonerId,
        profileIconUrl: profileIconUrl || current.profileIconUrl || null,
        enabled: true,
        lastLiveGameId: current.lastLiveGameId || null,
        lastFinishedMatchId: current.lastFinishedMatchId || null,
        lastCheckedAt: current.lastCheckedAt || null,
        createdAt: current.createdAt || new Date().toISOString(),
    };

    saveTracker(tracker);
    rememberKnownPlayer({
        gameName,
        tagLine,
        regiao,
        puuid,
        summonerId,
        iconUrl: profileIconUrl || null,
    });
    return tracker;
}

function removeTracker(userId, regiao, gameName, tagLine) {
    const key = trackerKey(userId, regiao, gameName, tagLine);
    db.delete(key);
}

function toggleTracker(input) {
    const existing = getTracker(input.userId, input.regiao, input.gameName, input.tagLine);
    if (existing) {
        removeTracker(input.userId, input.regiao, input.gameName, input.tagLine);
        return { mode: 'disabled', tracker: existing };
    }

    return {
        mode: 'enabled',
        tracker: upsertTracker(input),
    };
}

async function sendTrackerDm(client, tracker, embed, logPreview) {
    const user = await client.users.fetch(tracker.userId).catch(() => null);
    if (!user) return false;

    const dm = await user.createDM().catch(() => null);
    if (!dm) return false;

    const sent = await dm.send({ embeds: [embed] }).catch(() => null);
    if (!sent) return false;
    db.addLog('BOT_DM_OUTBOUND', `LoL tracker DM para ${tracker.userId}: ${String(logPreview || embed.data?.title || 'Atualizacao').slice(0, 220)}`, null, tracker.userId, tracker.riotId);
    return true;
}

async function inspectTracker(client, tracker) {
    if (!RIOT_KEY || !tracker?.enabled) return;

    const riotHeaders = { headers: { 'X-Riot-Token': RIOT_KEY } };

    try {
        const liveRes = await axios.get(
            `https://${tracker.regiao}.api.riotgames.com/lol/spectator/v5/active-games/by-summoner/${tracker.summonerId}`,
            riotHeaders
        ).catch((error) => {
            if (error.response?.status === 404) return null;
            throw error;
        });

        if (liveRes?.data) {
            const liveGame = liveRes.data;
            const liveGameId = String(liveGame.gameId);
            const me = liveGame.participants.find((player) => player.puuid === tracker.puuid) || null;

            if (tracker.lastLiveGameId !== liveGameId) {
                await sendTrackerDm(client, tracker, buildTrackerStartEmbed(tracker, liveGame, me), `${tracker.riotId} entrou em partida`);
                tracker.lastLiveGameId = liveGameId;
                saveTracker(tracker);
            }

            tracker.lastCheckedAt = new Date().toISOString();
            saveTracker(tracker);
            return;
        }

        if (tracker.lastLiveGameId) {
            const matchIdsRes = await axios.get(
                `https://${tracker.routing}.api.riotgames.com/lol/match/v5/matches/by-puuid/${tracker.puuid}/ids?start=0&count=1`,
                riotHeaders
            ).catch(() => null);

            const latestMatchId = matchIdsRes?.data?.[0];
            if (latestMatchId && latestMatchId !== tracker.lastFinishedMatchId) {
                const matchRes = await axios.get(
                    `https://${tracker.routing}.api.riotgames.com/lol/match/v5/matches/${latestMatchId}`,
                    riotHeaders
                ).catch(() => null);

                const participant = matchRes?.data?.info?.participants?.find((entry) => entry.puuid === tracker.puuid);
                if (matchRes?.data && participant) {
                    indexMatchParticipants([matchRes.data], tracker.regiao);
                    await sendTrackerDm(
                        client,
                        tracker,
                        buildTrackerFinishEmbed(tracker, matchRes.data, participant),
                        `${tracker.riotId} terminou uma partida`
                    );
                    tracker.lastFinishedMatchId = latestMatchId;
                }
            }

            tracker.lastLiveGameId = null;
        }

        tracker.lastCheckedAt = new Date().toISOString();
        saveTracker(tracker);
    } catch (error) {
        console.error('[LOL TRACKER]', tracker.riotId, error.message);
    }
}

async function checkTrackers(client) {
    if (trackerRunning) return;
    if (client.shard && client.shard.ids[0] !== 0) return;

    trackerRunning = true;
    try {
        const trackers = loadAllTrackers();
        for (const tracker of trackers) {
            await inspectTracker(client, tracker);
        }
    } finally {
        trackerRunning = false;
    }
}

function start(client) {
    if (trackerTimer) return;
    void checkTrackers(client);
    trackerTimer = setInterval(() => {
        void checkTrackers(client);
    }, CHECK_INTERVAL_MS);
}

module.exports = {
    start,
    getTracker,
    upsertTracker,
    removeTracker,
    toggleTracker,
    trackerKey,
};
