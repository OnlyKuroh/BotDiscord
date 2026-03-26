const db = require('./db');
const { callAI } = require('./ollama-client');

const SESSION_PREFIX = 'lol_matchup_coach_';
const SESSION_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_HISTORY_MESSAGES = 10;
const STOP_PATTERNS = [
    'acabou a partida',
    'a partida acabou',
    'fim da partida',
];

const DEFAULT_COACH_MODEL = process.env.GROQ_MATCHUP_MODEL || 'llama-3.3-70b-versatile';

function normalizeText(value) {
    return String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function getSessionKey(guildId, channelId, userId) {
    return `${SESSION_PREFIX}${guildId}_${channelId}_${userId}`;
}

function getSession(guildId, channelId, userId) {
    const session = db.get(getSessionKey(guildId, channelId, userId));
    if (!session) return null;

    if (!session.lastInteractionAt || (Date.now() - session.lastInteractionAt) > SESSION_TTL_MS) {
        db.deleteKey(getSessionKey(guildId, channelId, userId));
        return null;
    }

    return session;
}

function saveSession(guildId, channelId, userId, session) {
    db.set(getSessionKey(guildId, channelId, userId), {
        ...session,
        lastInteractionAt: Date.now(),
    });
}

function endSession(guildId, channelId, userId) {
    db.deleteKey(getSessionKey(guildId, channelId, userId));
}

function getCoachSystemPrompt(session) {
    return `
Você é um coach challenger coreano de League of Legends sentado do lado do jogador, como se o Faker estivesse analisando a partida junto.

Jeito de falar:
- português do Brasil;
- natural, direto, humano, zero corporativo;
- pode ser firme, mas nunca arrogante;
- nada de embed mental, textão burocrático ou linguagem fria de IA.

Missão:
- guiar o jogador do 00:00 até o nexus inimigo cair;
- responder como coach ao vivo, passo a passo, adaptando build, wave, troca, reset, objetivo, roam, TP, recall e teamfight;
- se faltar contexto importante, pergunte curto e objetivo;
- priorize sempre a próxima melhor decisão prática.

Contexto fixo da sessão:
- patch de referência: ${session.patchVersion || 'desconhecido'};
- matchup base: ${session.myChampion || 'desconhecido'} vs ${session.enemyChampion || 'desconhecido'};
- lane/role: ${session.role || 'desconhecida'};
- rank inimigo: ${session.enemyRank || 'não informado'};
- preocupação inicial: ${session.concern || 'não informada'};
- observações iniciais: ${session.notes || 'nenhuma'};
- aliados detectados: ${session.teammates?.join(', ') || 'não informados'};
- inimigos detectados: ${session.enemies?.join(', ') || 'não informados'};

Fontes abertas já consultadas:
- ${session.sourceNames?.length ? session.sourceNames.join(', ') : 'Riot/Data Dragon'}

Nomes validados do plano inicial:
- runas: ${session.validatedRunes?.join(', ') || 'sem runas travadas'};
- feitiços: ${session.validatedSummoners?.join(', ') || 'sem feitiços travados'};
- start: ${session.validatedStartItems?.join(', ') || 'sem item inicial travado'};
- core: ${session.validatedCoreItems?.join(', ') || 'sem core travado'};
- situacionais: ${session.validatedSituationalItems?.join(', ') || 'sem situacionais travados'};

Base factual disponível:
${session.sourceDigest || 'Sem digest extra salvo.'}

Plano inicial já montado:
${session.initialPlan || 'Sem plano salvo.'}

Regras de qualidade:
- responda normalmente em 3 a 8 linhas;
- se o momento exigir, use bullets curtos;
- trate como consenso real apenas o que estiver confirmado no contexto;
- se algo for leitura de coach e não dado confirmado, deixe isso claro sem ficar pedindo desculpa;
- não invente estatística, winrate ou matchup data externa;
- não invente nome de item, runa ou feitiço; se não souber, peça gold/estado da wave e ajuste a call sem cravar nome falso;
- assuma que o jogador quer ganhar a partida, não uma aula teórica;
- quando ele falar sobre wave, jungle, gold, item, TP, ignite, flash, drag, arauto, baron, side ou teamfight, transforme isso em call prática.

Encerramento:
- se o jogador disser que a partida acabou, não continue coachando; encerre de forma curta e respeitosa.
`.trim();
}

function buildConversationMessages(session, userMessage) {
    const history = Array.isArray(session.history) ? session.history.slice(-MAX_HISTORY_MESSAGES) : [];
    return [
        { role: 'system', content: getCoachSystemPrompt(session) },
        ...history,
        { role: 'user', content: userMessage },
    ];
}

function isStopMessage(content) {
    const normalized = normalizeText(content);
    return STOP_PATTERNS.some((pattern) => normalized.includes(pattern));
}

function formatInitialCoachText(session) {
    return [
        `Fechou. Coach ligado pra **${session.myChampion} vs ${session.enemyChampion}**${session.role ? ` na ${session.role}` : ''}.`,
        '',
        session.summary ? `Resumo salvo: ${session.summary}` : null,
        session.concern ? `Teu foco agora: ${session.concern}` : null,
        session.openingCall ? `Primeira call: ${session.openingCall}` : null,
        session.validatedStartItems?.length ? `Start sugerido: ${session.validatedStartItems.join(' | ')}` : null,
        session.validatedCoreItems?.length ? `Core provável: ${session.validatedCoreItems.join(' | ')}` : null,
        '',
        'Agora me atualiza normal no chat, tipo `lvl 3`, `wave vindo pra mim`, `900 gold`, `jungler top`, que eu vou te guiando na hora.',
        'Quando terminar, manda exatamente: **Acabou a partida**',
    ].filter(Boolean).join('\n');
}

function startMatchupCoachSession(payload) {
    const session = {
        guildId: payload.guildId,
        channelId: payload.channelId,
        userId: payload.userId,
        patchVersion: payload.patchVersion,
        myChampion: payload.myChampion,
        enemyChampion: payload.enemyChampion,
        role: payload.role || null,
        enemyRank: payload.enemyRank || null,
        concern: payload.concern || null,
        notes: payload.notes || null,
        teammates: payload.teammates || [],
        enemies: payload.enemies || [],
        sourceDigest: payload.sourceDigest || '',
        sourceNames: payload.sourceNames || [],
        initialPlan: payload.initialPlan || '',
        openingCall: payload.openingCall || '',
        summary: payload.summary || '',
        validatedRunes: payload.validatedRunes || [],
        validatedSummoners: payload.validatedSummoners || [],
        validatedStartItems: payload.validatedStartItems || [],
        validatedCoreItems: payload.validatedCoreItems || [],
        validatedSituationalItems: payload.validatedSituationalItems || [],
        model: payload.model || DEFAULT_COACH_MODEL,
        history: payload.initialPlan
            ? [{ role: 'assistant', content: payload.initialPlan.slice(0, 4000) }]
            : [],
        lastInteractionAt: Date.now(),
        startedAt: Date.now(),
    };

    saveSession(payload.guildId, payload.channelId, payload.userId, session);
    return session;
}

async function maybeHandleMatchupCoach(message) {
    if (!message.guild || message.author.bot) {
        return false;
    }

    const session = getSession(message.guild.id, message.channel.id, message.author.id);
    if (!session) {
        return false;
    }

    if (!message.content || message.content.startsWith('-')) {
        return false;
    }

    if (isStopMessage(message.content)) {
        endSession(message.guild.id, message.channel.id, message.author.id);
        await message.reply('Fechou. Parei de ler essa partida por aqui. Se quiser abrir outra, é só usar `/matchup` de novo.').catch(() => null);
        return true;
    }

    try {
        const aiResponse = await callAI(
            buildConversationMessages(session, message.content.slice(0, 1800)),
            {
                model: session.model || DEFAULT_COACH_MODEL,
                temperature: 0.35,
                maxTokens: 450,
            }
        );

        const responseText = String(aiResponse || 'Joga essa próxima janela com calma e me atualiza com o que aconteceu.').trim();
        session.history = [
            ...(Array.isArray(session.history) ? session.history : []),
            { role: 'user', content: message.content.slice(0, 1800) },
            { role: 'assistant', content: responseText.slice(0, 4000) },
        ].slice(-MAX_HISTORY_MESSAGES);
        saveSession(message.guild.id, message.channel.id, message.author.id, session);

        await message.reply(responseText.slice(0, 2000)).catch(() => null);
        return true;
    } catch (error) {
        console.error('[MATCHUP COACH]', error.response?.data || error.message);
        await message.reply('Tropecei aqui na leitura da partida. Me manda de novo o estado atual que eu retomo.').catch(() => null);
        return true;
    }
}

module.exports = {
    DEFAULT_COACH_MODEL,
    startMatchupCoachSession,
    formatInitialCoachText,
    maybeHandleMatchupCoach,
    endSession,
    getSession,
};
