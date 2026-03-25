const db = require('./db');
const { callAI } = require('./ollama-client');
const { buildGuildArrivalEmbed } = require('./system-embeds');
const { analyzeGuildRisk } = require('./security-monitor');
const { getItadoriUpdatePersonaPrompt } = require('./ai-personas');

const OWNER_SERVER_EVENTS_CHANNEL_ID = process.env.SERVER_EVENTS_CHANNEL_ID || '1482889916680634389';

async function reconcileKnownGuilds(client) {
    const knownGuildIds = db.get('known_guild_ids') || [];
    const currentGuildIds = client.guilds.cache.map((guild) => guild.id);

    for (const guild of client.guilds.cache.values()) {
        if (!knownGuildIds.includes(guild.id)) {
            await handleGuildJoin(client, guild, { detectedAfterRestart: true, suppressLog: false });
        }
    }

    db.set('known_guild_ids', currentGuildIds);
}

async function handleGuildJoin(client, guild, { detectedAfterRestart = false, suppressLog = false } = {}) {
    const snapshot = await buildGuildSnapshot(guild);
    const summary = await buildGuildSummary(snapshot);
    const titleUrl = await resolveGuildTitleUrl(guild, snapshot);

    const embed = buildGuildArrivalEmbed({
        title: snapshot.name,
        titleUrl,
        summary,
        guildName: snapshot.name,
        guildId: snapshot.id,
        ownerId: snapshot.ownerId,
        memberCount: snapshot.memberCount,
        preferredLocale: snapshot.preferredLocale,
        verificationLevel: snapshot.verificationLevel,
        features: snapshot.features,
        createdAt: snapshot.createdAt,
        joinedAt: snapshot.joinedAt,
        iconUrl: snapshot.iconUrl,
        imageUrl: snapshot.imageUrl,
        detectedAfterRestart,
    });

    if (!suppressLog) {
        db.addLog(
            'GUILD_JOIN',
            `${detectedAfterRestart ? 'Entrada reconhecida após religar' : 'Itadori adicionado ao servidor'} "${snapshot.name}" (${snapshot.memberCount} membros)`,
            snapshot.id,
            null,
            snapshot.name
        );
    }

    await sendToOwnerChannel(client, embed);
    await sendToNovidadesChannels(client, embed);

    try {
        const riskReport = await analyzeGuildRisk(guild, { force: true, maxChannels: 2, maxMessagesPerChannel: 3 });
        if (riskReport.analysis.riskLevel === 'alto' || riskReport.analysis.score >= 65) {
            db.addLog(
                'GUILD_RISK',
                [
                    `Servidor suspeito detectado: ${snapshot.name} (${snapshot.id})`,
                    `Score: ${riskReport.analysis.score}`,
                    `Idioma provavel: ${riskReport.analysis.likelyLanguage}`,
                    `Resumo: ${riskReport.analysis.summary}`,
                ].join(' | '),
                snapshot.id,
                null,
                'Security Monitor'
            );
        }
    } catch (error) {
        console.warn('[GUILD JOIN] Falha ao rodar monitoramento de risco:', error.message);
    }

    db.set('known_guild_ids', client.guilds.cache.map((cachedGuild) => cachedGuild.id));
}

async function buildGuildSnapshot(guild) {
    const fullGuild = await guild.fetch().catch(() => guild);
    const imageUrl =
        fullGuild.bannerURL?.({ size: 2048, extension: 'png' }) ||
        fullGuild.splashURL?.({ size: 2048, extension: 'png' }) ||
        fullGuild.iconURL?.({ size: 1024, extension: 'png' }) ||
        null;

    return {
        id: fullGuild.id,
        name: fullGuild.name,
        memberCount: fullGuild.memberCount || 0,
        preferredLocale: fullGuild.preferredLocale || 'desconhecido',
        ownerId: fullGuild.ownerId || 'desconhecido',
        createdAt: fullGuild.createdAt || new Date(),
        joinedAt: fullGuild.joinedAt || new Date(),
        verificationLevel: String(fullGuild.verificationLevel || 'desconhecido'),
        description: fullGuild.description || '',
        features: Array.isArray(fullGuild.features) ? fullGuild.features.slice(0, 8) : [],
        iconUrl: fullGuild.iconURL?.({ size: 512, extension: 'png' }) || null,
        imageUrl,
    };
}

async function buildGuildSummary(snapshot) {
    try {
        const prompt = JSON.stringify({
            goal: 'Resuma um novo servidor do Discord em portugues do Brasil sem inventar dados.',
            style: '4 a 6 linhas, tom de jornalzinho de comunidade, humano, bonito e sem marketing frio.',
            server: snapshot,
        });

        const response = await callAI([
            {
                role: 'system',
                content: [
                    'Voce resume servidores do Discord para anuncios automaticos.',
                    getItadoriUpdatePersonaPrompt(),
                    'Use apenas os dados enviados. Sem inventar, sem marketing frio e sem markdown excessivo.',
                ].join(' '),
            },
            {
                role: 'user',
                content: prompt,
            },
        ], {
            maxTokens: 280,
            temperature: 0.35,
        });

        if (response && response.trim()) return response.trim();
    } catch (error) {
        console.warn('[GUILD JOIN] IA indisponível para resumo do servidor:', error.message);
    }

    const featureText = snapshot.features.length
        ? `Recursos visíveis: ${snapshot.features.join(', ')}.`
        : 'Sem features especiais expostas pela API no momento.';

    return [
        `O bot acabou de entrar em **${snapshot.name}**, um servidor com cerca de **${snapshot.memberCount} membros** e idioma principal **${snapshot.preferredLocale}**.`,
        snapshot.description || 'Ainda não há descrição pública cadastrada para a guild, então o retrato foi montado a partir dos metadados disponíveis.',
        `${featureText} Nível de verificação atual: **${snapshot.verificationLevel}**.`,
    ].join('\n');
}

async function resolveGuildTitleUrl(guild, snapshot) {
    if (guild.vanityURLCode) {
        return `https://discord.gg/${guild.vanityURLCode}`;
    }
    return snapshot.iconUrl || null;
}

async function sendToOwnerChannel(client, embed) {
    const channel = await client.channels.fetch(OWNER_SERVER_EVENTS_CHANNEL_ID).catch(() => null);
    if (channel?.isTextBased?.()) {
        await channel.send({ embeds: [embed] }).catch(() => null);
    }
}

async function sendToNovidadesChannels(client, embed) {
    const entries = db.getEntriesByPrefix('novidades_channel_');

    for (const entry of entries) {
        const channelId = typeof entry.value === 'string' ? entry.value : String(entry.value || '');
        if (!channelId) continue;

        const channel = await client.channels.fetch(channelId).catch(() => null);
        if (channel?.isTextBased?.()) {
            await channel.send({ embeds: [embed] }).catch(() => null);
            const guildId = entry.key.replace('novidades_channel_', '');
            const roleId = db.get(`novidades_role_${guildId}`);
            if (roleId) {
                await channel.send({ content: `<@&${roleId}>` }).catch(() => null);
            }
        }
    }
}

module.exports = {
    handleGuildJoin,
    reconcileKnownGuilds,
};
