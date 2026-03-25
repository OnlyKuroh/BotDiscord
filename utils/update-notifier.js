const crypto = require('crypto');
const axios = require('axios');
const { EmbedBuilder } = require('discord.js');
const db = require('./db');
const { callAI } = require('./ollama-client');

const GITHUB_API_BASE = 'https://api.github.com';
const UPDATE_SYSTEM_NAME = process.env.UPDATE_SYSTEM_NAME || 'Itadori Yuji © System v2.1';
const UPDATE_POLL_MINUTES = Math.max(10, Number(process.env.UPDATES_POLL_MINUTES || 30));
const DEFAULT_REPOS = [
    { owner: process.env.BOT_REPO_OWNER || 'OnlyKuroh', repo: process.env.BOT_REPO_NAME || 'BotDiscord', label: 'Bot' },
    { owner: process.env.SITE_REPO_OWNER || 'OnlyKuroh', repo: process.env.SITE_REPO_NAME || 'ItadoriBot', label: 'Dashboard V2' },
];

let pollTimer = null;
let isRunning = false;

function start(client) {
    if (pollTimer) return;

    void syncUpdates(client);
    pollTimer = setInterval(() => {
        void syncUpdates(client);
    }, UPDATE_POLL_MINUTES * 60 * 1000);
}

async function syncUpdates(client, options = {}) {
    if (isRunning) return null;
    if (client.shard && client.shard.ids[0] !== 0) return null;

    isRunning = true;

    try {
        const changes = await collectRepoChanges();
        if (!changes.hasChanges) return null;

        const fingerprint = createFingerprint(changes.repos);
        const existing = db.getReleaseUpdateByFingerprint(fingerprint);
        const updatePayload = existing || await buildUpdatePayload(changes);

        if (!existing) {
            db.createReleaseUpdate(updatePayload);
            db.addLog('UPDATES_AI', `Nota de versao gerada automaticamente: ${updatePayload.title}`, null, null, 'Update Tracker');
        }

        for (const repo of changes.repos) {
            db.set(getRepoStateKey(repo.owner, repo.repo), repo.latestSha);
        }

        if (options.skipPublish !== true) {
            await publishUpdate(client, updatePayload);
        }

        return updatePayload;
    } catch (error) {
        console.error('[UPDATES] Falha ao sincronizar novidades:', error.message);
        return null;
    } finally {
        isRunning = false;
    }
}

async function collectRepoChanges() {
    const repos = [];

    for (const repoConfig of getTrackedRepos()) {
        const repoState = await getRepoChanges(repoConfig);
        if (repoState) repos.push(repoState);
    }

    return {
        hasChanges: repos.some((repo) => repo.commits.length > 0),
        repos,
    };
}

async function getRepoChanges(repoConfig) {
    const commits = await fetchRepoCommits(repoConfig.owner, repoConfig.repo, 10);
    if (!commits.length) return null;

    const latestSha = commits[0].sha;
    const lastSeenSha = db.get(getRepoStateKey(repoConfig.owner, repoConfig.repo));

    let changedCommits;
    if (!lastSeenSha) {
        changedCommits = commits.slice(0, Math.min(3, commits.length));
    } else {
        const knownIndex = commits.findIndex((commit) => commit.sha === lastSeenSha);
        if (knownIndex === 0) {
            changedCommits = [];
        } else if (knownIndex > 0) {
            changedCommits = commits.slice(0, knownIndex);
        } else {
            changedCommits = commits.slice(0, Math.min(5, commits.length));
        }
    }

    const detailedCommits = await Promise.all(
        changedCommits.map((commit) => fetchCommitDetail(repoConfig.owner, repoConfig.repo, commit.sha))
    );

    return {
        ...repoConfig,
        latestSha,
        commits: detailedCommits.filter(Boolean),
    };
}

async function fetchRepoCommits(owner, repo, limit = 10) {
    const response = await axios.get(`${GITHUB_API_BASE}/repos/${owner}/${repo}/commits`, {
        params: { per_page: limit },
        headers: buildGithubHeaders(),
        timeout: 20000,
    });

    return (response.data || []).map((commit) => ({
        sha: commit.sha,
        shortSha: commit.sha.slice(0, 7),
        message: normalizeCommitMessage(commit.commit?.message || ''),
        url: commit.html_url,
        author: commit.commit?.author?.name || 'Desconhecido',
        date: commit.commit?.author?.date || new Date().toISOString(),
    }));
}

async function fetchCommitDetail(owner, repo, sha) {
    const response = await axios.get(`${GITHUB_API_BASE}/repos/${owner}/${repo}/commits/${sha}`, {
        headers: buildGithubHeaders(),
        timeout: 20000,
    });

    const data = response.data || {};
    return {
        sha: data.sha,
        shortSha: data.sha?.slice(0, 7) || sha.slice(0, 7),
        message: normalizeCommitMessage(data.commit?.message || ''),
        author: data.commit?.author?.name || 'Desconhecido',
        date: data.commit?.author?.date || new Date().toISOString(),
        url: data.html_url,
        files: (data.files || []).slice(0, 8).map((file) => file.filename),
        stats: {
            additions: data.stats?.additions || 0,
            deletions: data.stats?.deletions || 0,
            total: data.stats?.total || 0,
        },
        category: classifyCommit(data.commit?.message || ''),
    };
}

function buildGithubHeaders() {
    const headers = {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'itadori-bot-update-tracker',
    };

    if (process.env.GITHUB_TOKEN) {
        headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    }

    return headers;
}

async function buildUpdatePayload(changes) {
    const fingerprint = createFingerprint(changes.repos);
    const commits = flattenCommits(changes.repos);
    const counts = buildCounts(commits);

    try {
        const aiPayload = await generateWithAI(changes.repos, counts);
        return {
            fingerprint,
            ...aiPayload,
            commits,
            repos: changes.repos.map(stripRepoPayload),
        };
    } catch (error) {
        console.warn('[UPDATES] IA indisponível, usando fallback local:', error.message);
        return {
            fingerprint,
            ...buildFallbackUpdate(changes.repos, counts),
            commits,
            repos: changes.repos.map(stripRepoPayload),
        };
    }
}

async function generateWithAI(repos, counts) {
    const compactRepos = repos.map((repo) => ({
        label: repo.label,
        repo: `${repo.owner}/${repo.repo}`,
        commits: repo.commits.map((commit) => ({
            sha: commit.shortSha,
            message: commit.message,
            category: commit.category,
            files: commit.files,
        })),
    }));

    const systemPrompt = [
        'Voce cria notas de atualizacao em portugues do Brasil para um bot de Discord e seu dashboard.',
        'Responda somente JSON valido.',
        'Estilo: profissional, forte, direto, parecido com um changelog premium.',
        'Nao invente funcionalidades que nao aparecam nos commits.',
        'Mantenha 3 secoes maximo.',
        'Campos obrigatorios:',
        '{',
        '  "title": string,',
        '  "lead": string,',
        '  "sections": [{ "icon": string, "title": string, "subtitle": string, "body": string, "calloutLabel": string, "calloutText": string }],',
        '  "closingText": string,',
        '  "summaryLines": [{ "kind": "feature"|"improvement"|"fix"|"total", "label": string, "text": string }]',
        '}',
    ].join(' ');

    const userPrompt = JSON.stringify({
        repos: compactRepos,
        counts,
        styleGuide: {
            titleExample: 'Update de Produtividade: O Fim dos Logs Manuais',
            summaryTone: 'objetivo, tecnico, elegante, sem emojis excessivos',
            includeCodeMentions: true,
            mentionBothBotAndDashboardWhenRelevant: true,
        },
    });

    const raw = await callAI([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
    ], {
        maxTokens: 900,
        temperature: 0.35,
    });

    const parsed = parseJsonObject(raw);
    return sanitizeAiPayload(parsed, counts);
}

function sanitizeAiPayload(payload, counts) {
    const fallback = buildFallbackUpdate([], counts);
    const summaryLines = Array.isArray(payload.summaryLines) && payload.summaryLines.length > 0
        ? payload.summaryLines.map((line) => ({
            kind: normalizeSummaryKind(line.kind),
            label: String(line.label || '').trim() || 'Resumo',
            text: String(line.text || '').trim() || 'Sem detalhes.',
        }))
        : fallback.summaryLines;

    return {
        title: String(payload.title || fallback.title).trim(),
        lead: String(payload.lead || fallback.lead).trim(),
        sections: Array.isArray(payload.sections) && payload.sections.length > 0
            ? payload.sections.slice(0, 3).map((section) => ({
                icon: String(section.icon || '✦').trim(),
                title: String(section.title || 'Atualizacao').trim(),
                subtitle: String(section.subtitle || 'Mudancas aplicadas').trim(),
                body: String(section.body || '').trim(),
                calloutLabel: String(section.calloutLabel || 'Como funciona').trim(),
                calloutText: String(section.calloutText || '').trim(),
            }))
            : fallback.sections,
        closingText: String(payload.closingText || fallback.closingText).trim(),
        summaryLines,
    };
}

function buildFallbackUpdate(repos, counts) {
    const activeRepos = repos.filter((repo) => repo.commits.length > 0);
    const labels = activeRepos.map((repo) => repo.label).join(' + ') || 'Bot';
    const topMessages = activeRepos.flatMap((repo) => repo.commits.slice(0, 2).map((commit) => commit.message));

    return {
        title: `Update de Sistema: ${labels} em sincronia`,
        lead: `Nesta rodada, o ecossistema do Itadori recebeu ${counts.total} alteracao${counts.total === 1 ? '' : 'oes'} rastreada${counts.total === 1 ? '' : 's'}, cobrindo ajustes no bot, no dashboard e no fluxo de deploy onde isso apareceu nos commits.`,
        sections: [
            {
                icon: '✦',
                title: 'Rastreamento Inteligente',
                subtitle: 'Mudancas consolidadas por repositorio',
                body: activeRepos.length
                    ? activeRepos.map((repo) => `**${repo.label}:** ${repo.commits.slice(0, 2).map((commit) => `\`${commit.message}\``).join(' • ')}`).join('\n')
                    : 'Nenhum repositorio trouxe detalhes suficientes para montar o resumo automatico.',
                calloutLabel: 'Contexto',
                calloutText: topMessages[0] || 'O sistema consolidou os commits mais recentes e preparou a leitura para Discord e dashboard.',
            },
            {
                icon: '🔒',
                title: 'Estabilidade e Acabamento',
                subtitle: 'Melhorias tecnicas e correcoes',
                body: `Foram detectadas **${counts.fixes} correcoes** e **${counts.improvements} melhorias**, com foco em estabilidade, estrutura e refinamento do fluxo principal.`,
                calloutLabel: 'Resultado',
                calloutText: 'Menos retrabalho manual, mais clareza sobre o que entrou em cada deploy.',
            },
        ],
        closingText: 'Agora, cada reinicio importante pode virar um changelog pronto para publicar.',
        summaryLines: buildSummaryLines(counts),
    };
}

async function publishUpdate(client, payload) {
    const guilds = client.guilds.cache.map((guild) => guild);

    for (const guild of guilds) {
        await publishUpdateToGuild(client, guild, payload);
    }
}

async function publishUpdateToGuild(client, guild, payload, options = {}) {
    const deliveredKey = `novidades_delivered_${guild.id}_${payload.fingerprint}`;
    if (!options.forceResend && db.get(deliveredKey)) {
        clearPendingDelivery(guild.id, payload.fingerprint);
        return { ok: true, status: 'already_delivered', channelId: db.get(`novidades_channel_${guild.id}`) || null };
    }

    const channelId = db.get(`novidades_channel_${guild.id}`);
    if (!channelId) {
        markPendingDelivery(guild.id, payload.fingerprint, null, 'Canal de novidades nao configurado');
        return { ok: false, status: 'missing_channel', channelId: null };
    }

    const channel = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
    if (!channel || !channel.isTextBased()) {
        markPendingDelivery(guild.id, payload.fingerprint, channelId, 'Canal de novidades indisponivel');
        return { ok: false, status: 'invalid_channel', channelId };
    }

    try {
        await channel.send({ embeds: [buildDiscordEmbed(client, payload)] });
        db.set(deliveredKey, {
            channelId,
            deliveredAt: new Date().toISOString(),
            forced: Boolean(options.forceResend),
        });
        clearPendingDelivery(guild.id, payload.fingerprint);
        return { ok: true, status: options.forceResend ? 'resent' : 'sent', channelId };
    } catch (error) {
        console.error(`[UPDATES] Falha ao publicar novidades em ${guild.id}:`, error.message);
        markPendingDelivery(guild.id, payload.fingerprint, channelId, error.message);
        return { ok: false, status: 'send_failed', channelId, error: error.message };
    }
}

async function forceDeliverPendingUpdate(client, guildId, options = {}) {
    const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) {
        return { ok: false, status: 'guild_not_found' };
    }

    const payload = findLatestUndeliveredPayloadForGuild(guildId);
    if (!payload) {
        return { ok: false, status: 'nothing_pending' };
    }

    return publishUpdateToGuild(client, guild, payload, {
        forceResend: Boolean(options.forceResend),
    });
}

function findLatestUndeliveredPayloadForGuild(guildId) {
    const pending = db.get(`novidades_pending_${guildId}`);
    if (pending?.fingerprint) {
        const pendingPayload = db.getReleaseUpdateByFingerprint(pending.fingerprint);
        if (pendingPayload) return pendingPayload;
    }

    const recentUpdates = db.getRecentReleaseUpdates(12);
    for (const payload of recentUpdates) {
        const deliveredKey = `novidades_delivered_${guildId}_${payload.fingerprint}`;
        if (!db.get(deliveredKey)) {
            return payload;
        }
    }

    return null;
}

function markPendingDelivery(guildId, fingerprint, channelId, reason) {
    db.set(`novidades_pending_${guildId}`, {
        fingerprint,
        channelId: channelId || null,
        reason: reason || 'Falha desconhecida ao publicar novidades',
        createdAt: new Date().toISOString(),
    });
}

function clearPendingDelivery(guildId, fingerprint) {
    const key = `novidades_pending_${guildId}`;
    const pending = db.get(key);
    if (!pending) return;
    if (fingerprint && pending.fingerprint && pending.fingerprint !== fingerprint) return;
    db.delete(key);
}

function buildDiscordEmbed(client, payload) {
    const descriptionSections = payload.sections.map((section) => {
        const lines = [
            `${section.icon} **${section.title}**`,
            `**${section.subtitle}**`,
            section.body,
        ];

        if (section.calloutText) {
            lines.push(`> **${section.calloutLabel || 'Como funciona'}:** ${section.calloutText}`);
        }

        return lines.filter(Boolean).join('\n');
    }).join('\n\n');

    const description = [
        payload.lead,
        '',
        'Confira os pilares desta versao:',
        '',
        descriptionSections,
        '',
        `*${payload.closingText}*`,
    ].filter(Boolean).join('\n');

    return new EmbedBuilder()
        .setColor('#2ecc71')
        .setAuthor({ name: UPDATE_SYSTEM_NAME, iconURL: client.user?.displayAvatarURL() || undefined })
        .setTitle(payload.title)
        .setDescription(description.slice(0, 4096))
        .addFields({
            name: '🧾 Resumo da Build',
            value: buildAnsiSummary(payload.summaryLines),
        })
        .setFooter({ text: `Administracao © Kuroh Community • ${formatUpdateDate(payload.createdAt || new Date().toISOString())}` })
        .setTimestamp(new Date(payload.createdAt || Date.now()));
}

function buildAnsiSummary(summaryLines) {
    const ansiLines = summaryLines.map((line) => {
        const color = getAnsiColor(line.kind);
        return `${color}${line.label}: ${line.text}\u001b[0m`;
    });

    return `\`\`\`ansi\n${ansiLines.join('\n')}\n\`\`\``;
}

function getAnsiColor(kind) {
    switch (kind) {
        case 'feature':
            return '\u001b[1;32m';
        case 'fix':
            return '\u001b[1;31m';
        case 'improvement':
            return '\u001b[1;33m';
        default:
            return '\u001b[1;37m';
    }
}

function buildCounts(commits) {
    return commits.reduce((acc, commit) => {
        if (commit.category === 'feature') acc.features += 1;
        else if (commit.category === 'fix') acc.fixes += 1;
        else acc.improvements += 1;
        acc.total += 1;
        return acc;
    }, { features: 0, improvements: 0, fixes: 0, total: 0 });
}

function buildSummaryLines(counts) {
    return [
        {
            kind: 'feature',
            label: '+ Features (Novidades)',
            text: `${String(counts.features).padStart(2, '0')} alteracoes de produto rastreadas`,
        },
        {
            kind: 'improvement',
            label: '! Improvements (Melhorias)',
            text: `${String(counts.improvements).padStart(2, '0')} refinamentos tecnicos consolidados`,
        },
        {
            kind: 'fix',
            label: '- Fixes (Correcões)',
            text: `${String(counts.fixes).padStart(2, '0')} correcoes ou blindagens aplicadas`,
        },
        {
            kind: 'total',
            label: '# Total de Alteracoes',
            text: `${counts.total} mudanca${counts.total === 1 ? '' : 's'} rastreada${counts.total === 1 ? '' : 's'}`,
        },
    ];
}

function flattenCommits(repos) {
    return repos.flatMap((repo) =>
        repo.commits.map((commit) => ({
            repo: `${repo.owner}/${repo.repo}`,
            label: repo.label,
            sha: commit.sha,
            shortSha: commit.shortSha,
            message: commit.message,
            files: commit.files,
            url: commit.url,
            category: commit.category,
            date: commit.date,
        }))
    );
}

function stripRepoPayload(repo) {
    return {
        owner: repo.owner,
        repo: repo.repo,
        label: repo.label,
        latestSha: repo.latestSha,
        commits: repo.commits.map((commit) => ({
            shortSha: commit.shortSha,
            message: commit.message,
            files: commit.files,
            category: commit.category,
            url: commit.url,
            date: commit.date,
        })),
    };
}

function getTrackedRepos() {
    const raw = process.env.UPDATES_REPOS_JSON;
    if (!raw) return DEFAULT_REPOS;

    try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed.filter((repo) => repo.owner && repo.repo);
        }
    } catch {
        console.warn('[UPDATES] UPDATES_REPOS_JSON invalido, usando repos padrao.');
    }

    return DEFAULT_REPOS;
}

function classifyCommit(message) {
    const normalized = String(message || '').toLowerCase();
    if (/^(fix|hotfix|bug|patch)\b/.test(normalized) || /(fix|bug|erro|crash|falha|corrig)/.test(normalized)) return 'fix';
    if (/^(feat|feature)\b/.test(normalized) || /(novo|nova|novidade|adiciona|implementa)/.test(normalized)) return 'feature';
    return 'improvement';
}

function normalizeCommitMessage(message) {
    return String(message || '').split('\n')[0].trim();
}

function createFingerprint(repos) {
    return crypto
        .createHash('sha1')
        .update(JSON.stringify(repos.map((repo) => ({
            repo: `${repo.owner}/${repo.repo}`,
            commits: repo.commits.map((commit) => commit.sha),
        }))))
        .digest('hex');
}

function getRepoStateKey(owner, repo) {
    return `updates_last_sha_${owner}_${repo}`;
}

function parseJsonObject(raw) {
    const text = String(raw || '').trim();
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) {
        throw new Error('JSON da IA nao encontrado.');
    }
    return JSON.parse(text.slice(start, end + 1));
}

function normalizeSummaryKind(kind) {
    if (kind === 'feature' || kind === 'fix' || kind === 'improvement' || kind === 'total') {
        return kind;
    }
    return 'total';
}

function formatUpdateDate(isoDate) {
    return new Date(isoDate).toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

module.exports = {
    start,
    syncUpdates,
    buildDiscordEmbed,
    publishUpdateToGuild,
    forceDeliverPendingUpdate,
    findLatestUndeliveredPayloadForGuild,
};
