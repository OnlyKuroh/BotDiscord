const axios = require('axios');
const db = require('./db');

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_MODEL = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';
const SUPPORT_CONTACT = process.env.ITADORI_SUPPORT_CONTACT || 'https://discord.gg/azSBYfjUHY';
const SESSION_TTL_MS = 15 * 60 * 1000;
const RESOLVED_COOLDOWN_MS = 30 * 60 * 1000;
const LOW_EFFORT_COOLDOWN_MS = 10 * 60 * 1000;
const MAX_TURNS = 8;
const MAX_HISTORY_MESSAGES = 6;
const MAX_INPUT_CHARS = 900;

// ── Rate Limits ──────────────────────────────────────────────────────────────
const GLOBAL_USER_COOLDOWN_MS = 8 * 1000; // 8 segundos entre qualquer interação global
const GLOBAL_RATE_LIMIT = 50; // máx 50 chamadas/minuto para o Groq (free tier safety)
const GUILD_RATE_LIMIT_PER_HOUR = 25; // máx 25 chamadas/hora por guild

const globalUserLastSeen = new Map(); // userId -> timestamp
const globalCallsThisMinute = { count: 0, resetAt: 0 }; // rate limit global
const guildCallsThisHour = new Map(); // guildId -> { count, resetAt }
const userFloodTracker = new Map(); // `${guildId}_${userId}` -> [timestamps]

const processingLocks = new Set();
const guildQueues = new Map();

const CENSOR_PATTERNS = [
    /\bmerda\b/,
    /\bbosta\b/,
    /\bputaria\b/,
    /\bputa\b/,
    /\bporra\b/,
    /\bcaralho\b/,
    /\bcacete\b/,
    /\bfoder\b/,
    /\bfudido\b/,
    /\bvsf\b/,
    /\bvtnc\b/,
    /\btmnc\b/,
    /\bfilho da puta\b/,
    /\barrombado\b/,
    /\bidiota\b/,
    /\botario\b/,
    /\bburro\b/,
    /\blixo\b/,
    /\bescroto\b/,
    /\bota ria\b/,
];

const BUG_PATTERNS = [
    'bug',
    'erro',
    'falha',
    'quebrou',
    'quebrado',
    'travando',
    'nao funciona',
    'não funciona',
    'nao esta funcionando',
    'não está funcionando',
    'crash',
    'defeito',
    'problema',
];

const ITADORI_SYSTEM_PROMPT = `
Você é o assistente oficial Itadori deste servidor no Discord.

Sua personalidade deve espelhar o projeto atual:
- inspirado em Yuji Itadori de Jujutsu Kaisen;
- protetor, humilde, prestativo, corajoso, energético e direto;
- fala em português do Brasil, com linguagem natural de Discord;
- usa referências leves ao universo do anime, como energia amaldiçoada, engrenagem, domínio e feiticeiro, mas sem exagerar;
- ajuda membros de forma prática e paciente até resolver a dúvida.

Contexto fixo do bot:
- nome: Itadori Bot;
- temas centrais: moderação, logs, welcome, verificação, utilidade, diversão, dashboard web e eventos/notícias;
- identidade do projeto: "Yuji vive", "Sukuna dorme", "grau especial online", "energia amaldiçoada", "engrenagem".

Regras de comportamento:
- responda como um chatbot útil, não como narrador de fanfic;
- normalmente responda em 2 a 5 linhas; use listas só quando realmente ajudar;
- se faltar contexto, faça no máximo 2 perguntas curtas e objetivas;
- conduza a conversa até sanar a dúvida do membro;
- se o membro disser que encontrou bug, erro ou falha, oriente de forma clara a entrar em contato pelo suporte ${SUPPORT_CONTACT} e explique que o contato direto é importante para enviar contexto, prints, logs e reproduzir o problema;
- nunca invente funcionalidades; se não souber, diga com honestidade e peça mais contexto;
- não use markdown pesado;
- quando perceber que a dúvida foi resolvida, ou que o usuário confirmou que terminou, despeça-se de forma curta e adicione exatamente o marcador [FIM_DUVIDA] no fim;
- não adicione [FIM_DUVIDA] se ainda houver dúvida em aberto.
`.trim();

function normalizeText(text) {
    return String(text || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

function getSessionKey(guildId, userId) {
    return `itadori_chat_session_${guildId}_${userId}`;
}

function getCooldownKey(guildId, userId) {
    return `itadori_chat_cooldown_${guildId}_${userId}`;
}

function getBlockedKey(guildId, userId) {
    return `itadori_chat_blocked_${guildId}_${userId}`;
}

function getProcessingKey(guildId, userId) {
    return `${guildId}:${userId}`;
}

function getGuildQueueState(guildId) {
    if (!guildQueues.has(guildId)) {
        guildQueues.set(guildId, {
            activeUserId: null,
            queue: [],
        });
    }
    return guildQueues.get(guildId);
}

function getSession(guildId, userId) {
    const session = db.get(getSessionKey(guildId, userId));
    if (!session) return null;

    if (!session.lastInteractionAt || (Date.now() - session.lastInteractionAt) > SESSION_TTL_MS) {
        db.delete(getSessionKey(guildId, userId));
        return null;
    }

    return session;
}

function saveSession(guildId, userId, session) {
    db.set(getSessionKey(guildId, userId), {
        ...session,
        lastInteractionAt: Date.now(),
    });
}

function clearSession(guildId, userId) {
    db.delete(getSessionKey(guildId, userId));
}

function setCooldown(guildId, userId, ms) {
    db.set(getCooldownKey(guildId, userId), Date.now() + ms);
}

function getRemainingCooldown(guildId, userId) {
    const until = db.get(getCooldownKey(guildId, userId));
    if (!until) return 0;
    const remaining = until - Date.now();
    if (remaining <= 0) {
        db.delete(getCooldownKey(guildId, userId));
        return 0;
    }
    return remaining;
}

function blockUser(guildId, userId, reason) {
    db.set(getBlockedKey(guildId, userId), {
        blockedAt: Date.now(),
        reason: reason || 'abuso',
    });
}

function isUserBlocked(guildId, userId) {
    return Boolean(db.get(getBlockedKey(guildId, userId)));
}

function stripMention(content, clientUserId) {
    return String(content || '')
        .replace(new RegExp(`<@!?${clientUserId}>`, 'g'), ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function containsCensoredLanguage(content) {
    const normalized = normalizeText(content);
    return CENSOR_PATTERNS.some(pattern => pattern.test(normalized));
}

function looksLikeBugReport(content) {
    const normalized = normalizeText(content);
    return BUG_PATTERNS.some(pattern => normalized.includes(pattern));
}

function isResolvedUserMessage(content) {
    const normalized = normalizeText(content);
    const closingPatterns = [
        'obrigado',
        'obrigada',
        'valeu',
        'era isso',
        'era so isso',
        'entendi',
        'resolveu',
        'resolvido',
        'ja consegui',
        'já consegui',
        'fechou',
        'de boa',
        'sem mais duvida',
        'tudo certo',
        'nao preciso mais',
        'não preciso mais',
        'nao precisa mais',
        'não precisa mais',
    ];

    return closingPatterns.some(pattern => normalized.includes(pattern));
}

function isLowEffort(content) {
    const normalized = normalizeText(content);
    const compact = normalized.replace(/\s+/g, ' ').trim();
    if (!compact) return true;
    if (compact.length < 10) return true; // Aumentado de 6 para 10
    if (/^(.)\1{6,}$/.test(compact.replace(/\s/g, ''))) return true;
    if (/^([a-z0-9]{1,6})(\s+\1){3,}$/.test(compact)) return true;
    if (!/[a-z0-9]/.test(compact)) return true;
    return false;
}

// ── Rate Limiting Functions ──────────────────────────────────────────────────

function checkGlobalRateLimit() {
    const now = Date.now();
    if (now > globalCallsThisMinute.resetAt) {
        globalCallsThisMinute.count = 0;
        globalCallsThisMinute.resetAt = now + 60_000;
    }
    if (globalCallsThisMinute.count >= GLOBAL_RATE_LIMIT) return false;
    globalCallsThisMinute.count++;
    return true;
}

function checkGuildRateLimit(guildId) {
    const now = Date.now();
    if (!guildCallsThisHour.has(guildId)) {
        guildCallsThisHour.set(guildId, { count: 0, resetAt: now + 3600_000 });
    }
    const state = guildCallsThisHour.get(guildId);
    if (now > state.resetAt) {
        state.count = 0;
        state.resetAt = now + 3600_000;
    }

    // Check ia_config for custom limit
    const iaConfig = db.get(`ia_config_${guildId}`) || {};
    const maxHour = iaConfig.maxCallsPerHour || GUILD_RATE_LIMIT_PER_HOUR;

    if (state.count >= maxHour) return false;
    state.count++;
    return true;
}

function isUserFlooding(guildId, userId) {
    const key = `${guildId}_${userId}`;
    const now = Date.now();
    if (!userFloodTracker.has(key)) {
        userFloodTracker.set(key, []);
    }
    const timestamps = userFloodTracker.get(key);
    // Manter apenas últimos 10s
    while (timestamps.length > 0 && timestamps[0] < now - 10_000) {
        timestamps.shift();
    }
    timestamps.push(now);
    return timestamps.length > 3; // Mais de 3 msgs em 10s = flood
}

// Cleanup periódico de maps de rate limit
setInterval(() => {
    const now = Date.now();
    // Limpar globalUserLastSeen
    if (globalUserLastSeen.size > 5000) {
        const cutoff = now - GLOBAL_USER_COOLDOWN_MS * 2;
        for (const [uid, ts] of globalUserLastSeen) {
            if (ts < cutoff) globalUserLastSeen.delete(uid);
        }
    }
    // Limpar guildCallsThisHour
    for (const [gid, state] of guildCallsThisHour) {
        if (now > state.resetAt + 3600_000) guildCallsThisHour.delete(gid);
    }
    // Limpar flood tracker
    for (const [key, timestamps] of userFloodTracker) {
        if (timestamps.length === 0 || timestamps[timestamps.length - 1] < now - 30_000) {
            userFloodTracker.delete(key);
        }
    }
}, 5 * 60 * 1000); // A cada 5 minutos

function buildMessages(systemPrompt, history, userMessage) {
    return [
        { role: 'system', content: systemPrompt },
        ...history,
        { role: 'user', content: userMessage.slice(0, MAX_INPUT_CHARS) },
    ];
}

async function callGroq(messages, memberName) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
        throw new Error('GROQ_API_KEY não configurada no .env');
    }

    const response = await axios.post(
        GROQ_API_URL,
        {
            model: DEFAULT_MODEL,
            temperature: 0.35,
            max_completion_tokens: 220,
            messages,
            user: memberName || undefined,
        },
        {
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            timeout: 30000,
        }
    );

    return response.data?.choices?.[0]?.message?.content?.trim() || '';
}

function sanitizeAssistantReply(text) {
    return String(text || '')
        .replace(/\[FIM_DUVIDA\]/gi, '')
        .trim()
        .slice(0, 1900);
}

function buildSystemPrompt(message) {
    const serverName = message.guild?.name || 'Servidor desconhecido';
    const memberName = message.member?.displayName || message.author?.username || 'Membro';

    return `${ITADORI_SYSTEM_PROMPT}

Contexto da conversa atual:
- servidor: ${serverName}
- membro: ${memberName}
- canal: #${message.channel?.name || 'chat'}
`.trim();
}

function getQueuePosition(guildId, userId) {
    const state = getGuildQueueState(guildId);
    const index = state.queue.findIndex(item => item.userId === userId);
    return index >= 0 ? index + 1 : 0;
}

function enqueueUser(guildId, userId, channelId) {
    const state = getGuildQueueState(guildId);
    const existing = getQueuePosition(guildId, userId);
    if (existing) return existing;

    state.queue.push({
        userId,
        channelId,
        queuedAt: Date.now(),
    });

    return state.queue.length;
}

function removeUserFromQueue(guildId, userId) {
    const state = getGuildQueueState(guildId);
    state.queue = state.queue.filter(item => item.userId !== userId);
    if (!state.activeUserId && state.queue.length === 0) {
        guildQueues.delete(guildId);
    }
}

async function notifyNextQueuedUser(guildId, client) {
    const state = getGuildQueueState(guildId);
    if (state.activeUserId) return;

    while (state.queue.length > 0) {
        const next = state.queue.shift();

        if (isUserBlocked(guildId, next.userId) || getRemainingCooldown(guildId, next.userId) > 0) {
            continue;
        }

        state.activeUserId = next.userId;
        const guild = client.guilds.cache.get(guildId);
        const channel = guild?.channels?.cache?.get(next.channelId);

        if (channel) {
            await channel.send(`<@${next.userId}>, tua vez na fila. Manda tua dúvida agora que eu sigo contigo.`).catch(() => null);
        }

        return;
    }

    guildQueues.delete(guildId);
}

async function syncGuildQueue(guildId, client) {
    const state = getGuildQueueState(guildId);
    if (!state.activeUserId) return;

    const activeSession = getSession(guildId, state.activeUserId);
    if (activeSession) return;

    state.activeUserId = null;
    await notifyNextQueuedUser(guildId, client);
}

async function releaseGuildTurn(guildId, userId, client) {
    const state = getGuildQueueState(guildId);
    removeUserFromQueue(guildId, userId);

    if (state.activeUserId === userId) {
        state.activeUserId = null;
    }

    await notifyNextQueuedUser(guildId, client);
}

function buildBugReply() {
    return [
        `Se isso é bug, erro ou falha real, fala direto no suporte: ${SUPPORT_CONTACT}`,
        'O ideal é te encaminhar pra lá porque bug precisa de contexto, prints, logs e passo a passo pra reproduzir direito.',
    ].join('\n');
}

async function silentlyBlockUser(message, guildId, userId, client, reason) {
    clearSession(guildId, userId);
    blockUser(guildId, userId, reason);
    await releaseGuildTurn(guildId, userId, client);
}

async function handleLowEffortMessage(message, session, guildId, userId) {
    const warnings = (session?.warnings || 0) + 1;

    if (warnings >= 2) {
        clearSession(guildId, userId);
        setCooldown(guildId, userId, LOW_EFFORT_COOLDOWN_MS);
        await message.reply('Preciso de uma dúvida real e objetiva pra ajudar de verdade. Vou encerrar por agora; depois do cooldown, me chama com um resumo curto do problema.');
        return true;
    }

    saveSession(guildId, userId, {
        channelId: message.channel.id,
        history: session?.history || [],
        warnings,
        turns: session?.turns || 0,
    });

    await message.reply('Manda a dúvida de forma objetiva. Diz o que você quer fazer, onde travou e qual erro apareceu.');
    return true;
}

/**
 * Verifica se está dentro da janela de horário configurada para a IA neste servidor.
 * @param {object} iaConfig
 * @returns {boolean}
 */
function isWithinTimeWindow(iaConfig) {
    if (iaConfig.horaInicio === undefined || iaConfig.horaFim === undefined) return true;
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
    const hour = now.getHours();
    const start = iaConfig.horaInicio;
    const end = iaConfig.horaFim;
    if (start <= end) return hour >= start && hour < end;
    // Janela que atravessa meia-noite (ex: 20h – 4h)
    return hour >= start || hour < end;
}

async function maybeHandleItadoriChat(message, client) {
    if (!message.guild || message.author.bot) return false;
    if (message.content.startsWith(client.prefix)) return false;

    const guildId = message.guild.id;
    const userId = message.author.id;

    // ── Blacklist de servidor ──────────────────────────────────────────────────
    if (db.isGuildBlacklisted(guildId)) return false;

    // ── Config de IA por servidor ──────────────────────────────────────────────
    const iaConfig = db.get(`ia_config_${guildId}`) || {};
    if (iaConfig.enabled === false) return false;

    // ── Rate limit global por usuário (anti-spam cross-guild) ──────────────────
    const lastSeen = globalUserLastSeen.get(userId) || 0;
    if (Date.now() - lastSeen < GLOBAL_USER_COOLDOWN_MS) return false;
    globalUserLastSeen.set(userId, Date.now());

    // ── Detecção de flood (>3 msgs em 10s) ────────────────────────────────────
    if (isUserFlooding(guildId, userId)) {
        setCooldown(guildId, userId, LOW_EFFORT_COOLDOWN_MS);
        await message.reply('Muitas mensagens seguidas. Calma aí, manda tua dúvida de uma vez só.').catch(() => null);
        return true;
    }

    const state = getGuildQueueState(guildId);

    await syncGuildQueue(guildId, client);

    const normalizedContent = normalizeText(message.content);
    const mentioned = message.mentions.has(client.user);
    const hasItadori = normalizedContent.includes('itadori');
    const hasDuvida = normalizedContent.includes('duvida');
    const triggerStart = mentioned || (hasItadori && hasDuvida);
    const queuedPosition = getQueuePosition(guildId, userId);
    const session = getSession(guildId, userId);
    const activeSession = session && session.channelId === message.channel.id;
    const cleanedContent = stripMention(message.content, client.user.id);
    const relevantMessage = activeSession || triggerStart || queuedPosition > 0;

    if (isUserBlocked(guildId, userId)) {
        if (relevantMessage) {
            clearSession(guildId, userId);
            removeUserFromQueue(guildId, userId);
            if (state.activeUserId === userId) {
                await releaseGuildTurn(guildId, userId, client);
            }
            return true;
        }
        return false;
    }

    if (!relevantMessage) return false;

    // ── Janela de horário (bloqueia apenas novas sessões, não as ativas) ────────
    if (!activeSession && triggerStart && !isWithinTimeWindow(iaConfig)) {
        const start = iaConfig.horaInicio;
        const end = iaConfig.horaFim;
        await message.reply(`Fora do horário de atendimento da IA neste servidor (${start}h – ${end}h, horário de Brasília). Volta mais tarde!`);
        return true;
    }

    if (!activeSession && getRemainingCooldown(guildId, userId) > 0) {
        const minutes = Math.max(1, Math.ceil(getRemainingCooldown(guildId, userId) / 60000));
        await message.reply(`Tua última conversa já foi encerrada. Espera cerca de ${minutes} min antes de puxar outro atendimento.`);
        return true;
    }

    if (queuedPosition > 0 && state.activeUserId !== userId) {
        await message.reply(`Yuji tá atendendo outra pessoa agora. Você já entrou na fila e está na posição **${queuedPosition}**.`);
        return true;
    }

    if (state.activeUserId && state.activeUserId !== userId) {
        const position = enqueueUser(guildId, userId, message.channel.id);
        await message.reply(`Yuji já está atendendo alguém neste servidor. Você entrou na fila na posição **${position}**.`);
        return true;
    }

    if (!state.activeUserId) {
        state.activeUserId = userId;
    }

    if (containsCensoredLanguage(cleanedContent)) {
        await silentlyBlockUser(message, guildId, userId, client, 'linguagem_ofensiva');
        return true;
    }

    const resolvedCooldown = (iaConfig.cooldownMinutes || 30) * 60 * 1000;

    if (isResolvedUserMessage(cleanedContent)) {
        clearSession(guildId, userId);
        setCooldown(guildId, userId, resolvedCooldown);
        await message.reply('Fechou. Como tua dúvida já acabou, vou encerrar por aqui. Depois do cooldown, se surgir outra real, me chama.');
        await releaseGuildTurn(guildId, userId, client);
        return true;
    }

    if (looksLikeBugReport(cleanedContent)) {
        clearSession(guildId, userId);
        setCooldown(guildId, userId, resolvedCooldown);
        await message.reply(buildBugReply());
        await releaseGuildTurn(guildId, userId, client);
        return true;
    }

    if (isLowEffort(cleanedContent)) {
        return handleLowEffortMessage(message, session, guildId, userId);
    }

    const processingKey = getProcessingKey(guildId, userId);
    if (processingLocks.has(processingKey)) {
        await message.reply('Calma aí, ainda tô processando tua última mensagem.');
        return true;
    }

    const turns = activeSession ? (session.turns || 0) : 0;
    if (turns >= MAX_TURNS) {
        clearSession(guildId, userId);
        setCooldown(guildId, userId, resolvedCooldown);
        await message.reply('Essa conversa já ficou longa demais. Vou encerrar e deixar um cooldown. Se precisar de novo, volta com um resumo curto e objetivo.');
        await releaseGuildTurn(guildId, userId, client);
        return true;
    }

    // ── Rate limits antes de chamar Groq ──────────────────────────────────────
    if (!checkGlobalRateLimit()) {
        await message.reply('Muita gente usando a IA agora. Tenta de novo em 1 minuto.').catch(() => null);
        return true;
    }

    if (!checkGuildRateLimit(guildId)) {
        await message.reply('Limite de atendimentos IA deste servidor atingido por hora. Volta daqui a pouco!').catch(() => null);
        return true;
    }

    const history = activeSession ? (session.history || []).slice(-MAX_HISTORY_MESSAGES) : [];
    const systemPrompt = buildSystemPrompt(message);
    const messages = buildMessages(systemPrompt, history, cleanedContent);

    processingLocks.add(processingKey);

    // ── DM mode: responde no privado do usuário ────────────────────────────────
    const dmMode = iaConfig.dmMode === true;

    try {
        await message.channel.sendTyping().catch(() => null);
        const rawReply = await callGroq(messages, message.author.username);
        const resolved = /\[FIM_DUVIDA\]/i.test(rawReply);
        const assistantReply = sanitizeAssistantReply(rawReply) || 'Tô aqui. Reformula tua dúvida em uma frase mais direta que eu continuo.';

        if (dmMode) {
            const dm = await message.author.createDM().catch(() => null);
            if (dm) {
                await dm.send(assistantReply).catch(() => null);
                await message.reply('📬 Respondi no seu privado!').catch(() => null);
            } else {
                await message.reply(assistantReply);
            }
        } else {
            await message.reply(assistantReply);
        }

        if (resolved) {
            clearSession(guildId, userId);
            setCooldown(guildId, userId, RESOLVED_COOLDOWN_MS);
            await releaseGuildTurn(guildId, userId, client);
            return true;
        }

        saveSession(guildId, userId, {
            channelId: message.channel.id,
            warnings: 0,
            turns: turns + 1,
            history: [
                ...history,
                { role: 'user', content: cleanedContent.slice(0, MAX_INPUT_CHARS) },
                { role: 'assistant', content: assistantReply },
            ].slice(-MAX_HISTORY_MESSAGES),
        });

        return true;
    } catch (err) {
        console.error('[ITADORI CHATBOT]', err.response?.status || err.message);
        clearSession(guildId, userId);
        await releaseGuildTurn(guildId, userId, client);
        await message.reply('Tentei responder, mas a conexão com minha energia amaldiçoada caiu agora. Me chama de novo depois.');
        return true;
    } finally {
        processingLocks.delete(processingKey);
    }
}

module.exports = {
    maybeHandleItadoriChat,
};
