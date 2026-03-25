const db = require('./db');
const { callAI } = require('./ollama-client');

const guildCommandTracker = new Map();
const globalUserCommandTracker = new Map();

function pruneTimestamps(list, maxAgeMs) {
    const cutoff = Date.now() - maxAgeMs;
    return list.filter((timestamp) => timestamp >= cutoff);
}

function containsCyrillic(text) {
    return /[\u0400-\u04FF]/.test(String(text || ''));
}

function detectLikelyLanguage(snapshot, samples) {
    const locale = String(snapshot.preferredLocale || '').toLowerCase();
    if (locale.includes('pt')) return 'pt-BR';
    if (locale.includes('ru')) return 'ru';
    if (locale.includes('es')) return 'es';
    if (locale.includes('en')) return 'en';

    const sampleText = samples.map((sample) => sample.content).join(' ');
    if (containsCyrillic(sampleText)) return 'ru / cirilico';
    return snapshot.preferredLocale || 'desconhecido';
}

async function collectRecentMessageSamples(guild, options = {}) {
    const maxChannels = options.maxChannels || 3;
    const maxMessagesPerChannel = options.maxMessagesPerChannel || 4;
    const output = [];

    const channels = guild.channels.cache
        .filter((channel) => channel.isTextBased?.() && !channel.isThread?.() && channel.viewable)
        .sort((a, b) => (a.rawPosition || 0) - (b.rawPosition || 0))
        .first(maxChannels);

    for (const channel of channels) {
        try {
            const messages = await channel.messages.fetch({ limit: maxMessagesPerChannel }).catch(() => null);
            if (!messages) continue;

            for (const message of [...messages.values()].reverse()) {
                if (message.author?.bot) continue;
                output.push({
                    channelId: channel.id,
                    channelName: channel.name,
                    authorId: message.author?.id || null,
                    authorTag: message.author?.tag || message.author?.username || 'desconhecido',
                    content: String(message.content || '[sem texto]').slice(0, 220),
                    createdAt: message.createdAt?.toISOString?.() || new Date().toISOString(),
                });
            }
        } catch {
            continue;
        }
    }

    return output.slice(0, maxChannels * maxMessagesPerChannel);
}

async function buildGuildSecuritySnapshot(guild) {
    await guild.members.fetch().catch(() => null);

    const members = [...guild.members.cache.values()];
    const humans = members.filter((member) => !member.user.bot);
    const bots = members.filter((member) => member.user.bot);
    const admins = humans.filter((member) => member.permissions.has(8n));
    const riskyMembers = humans.filter((member) =>
        member.permissions.has(32n) ||
        member.permissions.has(4n) ||
        member.permissions.has(536870912n)
    );

    let webhookCount = null;
    let inviteCount = null;
    try {
        webhookCount = (await guild.fetchWebhooks()).size;
    } catch {}
    try {
        inviteCount = (await guild.invites.fetch()).size;
    } catch {}

    const textChannels = guild.channels.cache.filter((channel) => channel.isTextBased?.() && !channel.isThread?.()).size;
    const channelNames = guild.channels.cache.map((channel) => channel.name).slice(0, 20);
    const roleNames = guild.roles.cache.map((role) => role.name).slice(0, 20);
    const cyrillicSignals = [...channelNames, ...roleNames].filter(containsCyrillic);
    const ageDays = Math.floor((Date.now() - guild.createdAt.getTime()) / 86400000);

    return {
        id: guild.id,
        name: guild.name,
        ownerId: guild.ownerId,
        memberCount: guild.memberCount,
        humanCount: humans.length,
        botCount: bots.length,
        adminCount: admins.length,
        riskyPermissionCount: riskyMembers.length,
        preferredLocale: guild.preferredLocale || 'desconhecido',
        verificationLevel: String(guild.verificationLevel || 'desconhecido'),
        features: guild.features?.slice(0, 10) || [],
        createdAt: guild.createdAt.toISOString(),
        joinedAt: guild.joinedAt?.toISOString?.() || null,
        ageDays,
        textChannels,
        webhookCount,
        inviteCount,
        cyrillicSignals,
    };
}

function buildHeuristicRisk(snapshot, samples) {
    const flags = [];
    let score = 0;

    const botRatio = snapshot.memberCount > 0 ? snapshot.botCount / snapshot.memberCount : 0;
    const likelyLanguage = detectLikelyLanguage(snapshot, samples);

    if (snapshot.memberCount <= 20) {
        score += 20;
        flags.push('Servidor muito pequeno.');
    }
    if (snapshot.ageDays <= 14) {
        score += 15;
        flags.push('Servidor criado recentemente.');
    }
    if (!String(snapshot.preferredLocale || '').toLowerCase().includes('pt')) {
        score += 20;
        flags.push(`Locale fora do foco BR: ${snapshot.preferredLocale}.`);
    }
    if (containsCyrillic(snapshot.name) || snapshot.cyrillicSignals.length > 0 || likelyLanguage.includes('ru')) {
        score += 30;
        flags.push('Sinais de idioma cirilico/russo em nome, cargos, canais ou mensagens.');
    }
    if (botRatio >= 0.35) {
        score += 10;
        flags.push(`Taxa de bots elevada (${Math.round(botRatio * 100)}%).`);
    }
    if (snapshot.webhookCount !== null && snapshot.webhookCount >= 4) {
        score += 10;
        flags.push('Quantidade alta de webhooks para o porte do servidor.');
    }
    if (snapshot.riskyPermissionCount >= 3) {
        score += 10;
        flags.push('Varios membros com permissoes perigosas.');
    }
    if (snapshot.textChannels <= 2) {
        score += 5;
        flags.push('Estrutura extremamente pequena de canais de texto.');
    }

    const riskLevel = score >= 70 ? 'alto' : score >= 40 ? 'medio' : 'baixo';
    const summary = flags.length
        ? flags.join(' ')
        : 'Nenhum sinal forte de risco apareceu pela heuristica local.';

    return {
        score: Math.min(score, 100),
        riskLevel,
        likelyLanguage,
        flags,
        summary,
    };
}

async function generateAiSecurityAnalysis(snapshot, samples, heuristic) {
    const samplePayload = samples.slice(0, 8).map((sample) => ({
        channel: sample.channelName,
        author: sample.authorTag,
        content: sample.content,
    }));

    const systemPrompt = [
        'Voce e um analista de seguranca de bots Discord.',
        'Responda apenas JSON valido.',
        'Campos obrigatorios:',
        '{ "score": number, "riskLevel": "baixo"|"medio"|"alto", "likelyLanguage": string, "flags": string[], "summary": string, "recommendedAction": string }',
        'Use apenas os dados enviados.',
        'Leve em conta se o bot e focado em publico brasileiro.',
    ].join(' ');

    const userPrompt = JSON.stringify({
        botAudience: 'publico brasileiro, foco principal pt-BR',
        snapshot,
        heuristic,
        recentSamples: samplePayload,
    });

    const raw = await callAI([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
    ], {
        maxTokens: 350,
        temperature: 0.2,
    });

    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start === -1 || end === -1) {
        throw new Error('JSON de analise nao encontrado.');
    }

    const parsed = JSON.parse(raw.slice(start, end + 1));
    return {
        score: Math.max(0, Math.min(100, Number(parsed.score) || heuristic.score)),
        riskLevel: ['baixo', 'medio', 'alto'].includes(parsed.riskLevel) ? parsed.riskLevel : heuristic.riskLevel,
        likelyLanguage: String(parsed.likelyLanguage || heuristic.likelyLanguage),
        flags: Array.isArray(parsed.flags) && parsed.flags.length ? parsed.flags.slice(0, 8).map(String) : heuristic.flags,
        summary: String(parsed.summary || heuristic.summary).slice(0, 700),
        recommendedAction: String(parsed.recommendedAction || 'Seguir monitorando.').slice(0, 300),
    };
}

async function analyzeGuildRisk(guild, options = {}) {
    const cacheKey = `guild_security_scan_${guild.id}`;
    const cached = db.get(cacheKey);
    const maxAgeMs = options.maxAgeMs || 30 * 60 * 1000;

    if (!options.force && cached?.createdAt && (Date.now() - new Date(cached.createdAt).getTime()) < maxAgeMs) {
        return cached;
    }

    const snapshot = await buildGuildSecuritySnapshot(guild);
    const recentMessages = await collectRecentMessageSamples(guild, options);
    const heuristic = buildHeuristicRisk(snapshot, recentMessages);

    let ai = null;
    try {
        ai = await generateAiSecurityAnalysis(snapshot, recentMessages, heuristic);
    } catch {
        ai = null;
    }

    const result = {
        guildId: guild.id,
        guildName: guild.name,
        createdAt: new Date().toISOString(),
        snapshot,
        recentMessages,
        heuristic,
        analysis: ai || {
            ...heuristic,
            recommendedAction: heuristic.riskLevel === 'alto'
                ? 'Monitorar de perto, revisar owner/admins e considerar blacklist se o comportamento continuar suspeito.'
                : 'Seguir monitorando o servidor.',
        },
    };

    db.set(cacheKey, result);
    return result;
}

function trackCommandAbuse({ guild, user, commandName, source = 'slash' }) {
    if (!guild || !user) return null;

    const guildKey = `${guild.id}:${user.id}`;
    const globalKey = `${user.id}`;
    const now = Date.now();

    const guildEntry = guildCommandTracker.get(guildKey) || [];
    const globalEntry = globalUserCommandTracker.get(globalKey) || [];

    const guildTimestamps = pruneTimestamps(guildEntry, 5 * 60 * 1000);
    const globalTimestamps = pruneTimestamps(globalEntry, 5 * 60 * 1000);

    guildTimestamps.push(now);
    globalTimestamps.push(now);

    guildCommandTracker.set(guildKey, guildTimestamps);
    globalUserCommandTracker.set(globalKey, globalTimestamps);

    const in45s = guildTimestamps.filter((timestamp) => timestamp >= now - 45_000).length;
    const in5m = guildTimestamps.length;
    const global5m = globalTimestamps.length;

    const cooldownKey = `command_abuse_alert_${guild.id}_${user.id}`;
    const lastAlert = db.get(cooldownKey) || 0;
    const canAlert = (now - Number(lastAlert)) > 10 * 60 * 1000;

    let severity = null;
    if (in45s >= 8) severity = 'alto';
    else if (in5m >= 18 || global5m >= 24) severity = 'medio';

    if (!severity || !canAlert) return null;

    db.set(cooldownKey, now);
    const content = [
        `Possivel abuso de comandos detectado em **${guild.name}**.`,
        `Usuario: ${user.username} (${user.id})`,
        `Origem: ${source}`,
        `Ultimo comando: ${commandName}`,
        `Janela 45s: ${in45s}`,
        `Janela 5m neste servidor: ${in5m}`,
        `Janela 5m global do usuario: ${global5m}`,
    ].join(' | ');

    db.addLog('COMMAND_SPAM', content, guild.id, user.id, user.username);

    const storedRisk = getStoredGuildRiskScan(guild.id);
    if (storedRisk?.analysis?.score >= 60 || storedRisk?.analysis?.riskLevel === 'alto') {
        db.addLog(
            'SECURITY_ALERT',
            `Spam de comandos em servidor ja marcado como suspeito. Score ${storedRisk.analysis.score} | ${guild.name} | Usuario ${user.username}`,
            guild.id,
            user.id,
            user.username
        );
    }

    return {
        severity,
        in45s,
        in5m,
        global5m,
    };
}

function getStoredGuildRiskScan(guildId) {
    return db.get(`guild_security_scan_${guildId}`) || null;
}

module.exports = {
    analyzeGuildRisk,
    collectRecentMessageSamples,
    getStoredGuildRiskScan,
    trackCommandAbuse,
};
