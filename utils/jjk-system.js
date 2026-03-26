const db = require('./db');

const JJK_GUILD_ID = '1481534382165721223';
const TIMEZONE = 'America/Sao_Paulo';
const FREEZE_PRICE = 850;
const COMMAND_ACTIVITY_COOLDOWN_MS = 20 * 60 * 1000;
const MESSAGE_REWARD_COOLDOWN_MS = 45 * 1000;
const VOICE_SESSION_MINUTES = 10;
const STREAK_BREAK_MS = 24 * 60 * 60 * 1000;
const STREAK_GRACE_MS = 5 * 60 * 60 * 1000;

function isJjkGuild(guildId) {
    return String(guildId || '') === JJK_GUILD_ID;
}

function profileKey(guildId, userId) {
    return `jjk_profile_${guildId}_${userId}`;
}

function messageMetaKey(guildId, userId) {
    return `jjk_message_meta_${guildId}_${userId}`;
}

function voiceSessionKey(guildId, userId) {
    return `jjk_voice_session_${guildId}_${userId}`;
}

function levelRoleConfigKey(guildId) {
    return `jjk_level_roles_${guildId}`;
}

function badgeConfigKey(guildId) {
    return `jjk_badges_${guildId}`;
}

function nowIso() {
    return new Date().toISOString();
}

function getBrazilDateKey(input = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(new Date(input));

    const year = parts.find((part) => part.type === 'year')?.value;
    const month = parts.find((part) => part.type === 'month')?.value;
    const day = parts.find((part) => part.type === 'day')?.value;
    return `${year}-${month}-${day}`;
}

function defaultProfile(guildId, userId) {
    return {
        guildId,
        userId,
        xp: 0,
        level: 1,
        money: 0,
        lootboxes: 0,
        streak: 0,
        bestStreak: 0,
        totalMessages: 0,
        totalMeaningfulMessages: 0,
        totalCommands: 0,
        totalVoiceMinutes: 0,
        suspiciousMessages: 0,
        lastMeaningfulActivityAt: null,
        lastChatAt: null,
        lastVoiceAt: null,
        lastCommandAt: null,
        lastStreakAwardDayKey: null,
        pendingGrace: null,
        streakPenaltyFactor: 1,
        streakPenaltyUntil: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
    };
}

function loadProfile(guildId, userId) {
    const saved = db.get(profileKey(guildId, userId));
    return {
        ...defaultProfile(guildId, userId),
        ...(saved || {}),
    };
}

function saveProfile(profile) {
    profile.updatedAt = nowIso();
    db.set(profileKey(profile.guildId, profile.userId), profile);
    return profile;
}

function loadMessageMeta(guildId, userId) {
    return db.get(messageMetaKey(guildId, userId)) || {
        lastNormalized: '',
        lastRewardAt: null,
        recent: [],
    };
}

function saveMessageMeta(guildId, userId, meta) {
    db.set(messageMetaKey(guildId, userId), meta);
}

function normalizeMessageContent(content) {
    return String(content || '')
        .toLowerCase()
        .replace(/<a?:\w+:\d+>/g, ' ')
        .replace(/https?:\/\/\S+/g, ' ')
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function getLevelFromXp(xp) {
    let level = 1;
    let required = 0;

    while (xp >= required + getXpNeededForLevel(level)) {
        required += getXpNeededForLevel(level);
        level += 1;
    }

    return level;
}

function getXpNeededForLevel(level) {
    return 120 + ((level - 1) * 45);
}

function getLevelProgress(xp) {
    const level = getLevelFromXp(xp);
    let spent = 0;

    for (let current = 1; current < level; current += 1) {
        spent += getXpNeededForLevel(current);
    }

    const currentLevelXp = xp - spent;
    const nextLevelXp = getXpNeededForLevel(level);

    return {
        level,
        currentLevelXp,
        nextLevelXp,
        ratio: Math.max(0, Math.min(1, currentLevelXp / nextLevelXp)),
    };
}

function buildProgressBar(ratio, size = 10) {
    const filled = Math.round(Math.max(0, Math.min(1, ratio)) * size);
    return `${'▰'.repeat(filled)}${'▱'.repeat(Math.max(0, size - filled))}`;
}

function formatRelativeDuration(ms) {
    const totalMinutes = Math.max(0, Math.floor(ms / 60000));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours <= 0) return `${minutes}min`;
    if (minutes <= 0) return `${hours}h`;
    return `${hours}h ${minutes}min`;
}

function rollLootbox(chance = 0.03) {
    return Math.random() <= chance;
}

function refreshProfileState(profile, now = new Date()) {
    const resolvedNow = new Date(now);
    const lastMeaningful = profile.lastMeaningfulActivityAt ? new Date(profile.lastMeaningfulActivityAt) : null;

    if (profile.pendingGrace?.graceEndsAt && resolvedNow > new Date(profile.pendingGrace.graceEndsAt)) {
        profile.pendingGrace = null;
    }

    if (profile.streakPenaltyUntil && resolvedNow > new Date(profile.streakPenaltyUntil)) {
        profile.streakPenaltyFactor = 1;
        profile.streakPenaltyUntil = null;
    }

    if (!lastMeaningful) {
        return profile;
    }

    if ((resolvedNow.getTime() - lastMeaningful.getTime()) > STREAK_BREAK_MS && !profile.pendingGrace) {
        profile.pendingGrace = {
            previousStreak: profile.streak,
            graceEndsAt: new Date(lastMeaningful.getTime() + STREAK_BREAK_MS + STREAK_GRACE_MS).toISOString(),
            missedAt: new Date(lastMeaningful.getTime() + STREAK_BREAK_MS).toISOString(),
        };
        profile.streak = 0;
    }

    return profile;
}

function applyMeaningfulActivity(profile, now = new Date(), source = 'chat') {
    const resolvedNow = new Date(now);
    const dayKey = getBrazilDateKey(resolvedNow);
    const lastDayKey = profile.lastStreakAwardDayKey;
    const lastMeaningful = profile.lastMeaningfulActivityAt ? new Date(profile.lastMeaningfulActivityAt) : null;

    refreshProfileState(profile, resolvedNow);

    if (!lastMeaningful) {
        profile.streak = 1;
        profile.bestStreak = Math.max(profile.bestStreak, profile.streak);
        profile.lastStreakAwardDayKey = dayKey;
    } else if (!profile.pendingGrace && dayKey !== lastDayKey) {
        profile.streak = Math.max(1, profile.streak + 1);
        profile.bestStreak = Math.max(profile.bestStreak, profile.streak);
        profile.lastStreakAwardDayKey = dayKey;
    } else if (profile.streak <= 0 && !profile.pendingGrace) {
        profile.streak = 1;
        profile.bestStreak = Math.max(profile.bestStreak, profile.streak);
        profile.lastStreakAwardDayKey = dayKey;
    }

    profile.lastMeaningfulActivityAt = resolvedNow.toISOString();
    if (source === 'chat') profile.lastChatAt = resolvedNow.toISOString();
    if (source === 'command') profile.lastCommandAt = resolvedNow.toISOString();
    if (source === 'voice') profile.lastVoiceAt = resolvedNow.toISOString();
}

function getEffectiveStreakBonus(profile, now = new Date()) {
    refreshProfileState(profile, now);
    const rawBonus = Math.min(0.45, profile.streak * 0.03);
    const factor = profile.streakPenaltyFactor || 1;
    return rawBonus * factor;
}

function evaluateMessageQuality(meta, content) {
    const normalized = normalizeMessageContent(content);
    const words = normalized.split(' ').filter(Boolean);
    const compact = normalized.replace(/\s/g, '');
    const uniqueWords = new Set(words);
    const uniqueChars = new Set(compact.split(''));
    const repeatedChars = /(.)\1{5,}/i.test(normalized);
    const duplicate = normalized && normalized === meta.lastNormalized;
    const tooShort = compact.length < 8;
    const tooSimple = words.length < 3 && compact.length < 18;
    const lowVariation = compact.length > 0 && (uniqueChars.size / compact.length) < 0.3;
    const lowWordVariation = words.length > 0 && (uniqueWords.size / words.length) < 0.5;

    const reasons = [];
    if (!normalized) reasons.push('sem-conteudo');
    if (tooShort) reasons.push('curta');
    if (tooSimple) reasons.push('simples');
    if (repeatedChars) reasons.push('repeticao-char');
    if (duplicate) reasons.push('duplicada');
    if (lowVariation) reasons.push('baixa-variedade');
    if (lowWordVariation) reasons.push('baixa-variedade-palavras');

    const meaningful = reasons.length === 0;
    const score = meaningful
        ? Math.min(12, 4 + words.length + Math.floor(compact.length / 24))
        : 0;

    return {
        normalized,
        meaningful,
        score,
        reasons,
    };
}

async function grantProfileRewards({ guild, userId, source, qualityScore = 0, minutes = 0 }) {
    if (!isJjkGuild(guild?.id)) return null;

    const profile = refreshProfileState(loadProfile(guild.id, userId), new Date());
    const beforeLevel = profile.level;

    applyMeaningfulActivity(profile, new Date(), source);

    let xpGain = 0;
    let moneyGain = 0;
    let lootboxes = 0;

    if (source === 'chat') {
        const streakBonus = getEffectiveStreakBonus(profile);
        xpGain = Math.round((18 + qualityScore) * (1 + streakBonus));
        moneyGain = 10 + Math.max(0, qualityScore - 2);
        if (rollLootbox(0.04)) lootboxes += 1;
        profile.totalMeaningfulMessages += 1;
    } else if (source === 'command') {
        const streakBonus = getEffectiveStreakBonus(profile);
        xpGain = Math.round(10 * (1 + streakBonus));
        moneyGain = 8;
        profile.totalCommands += 1;
    } else if (source === 'voice') {
        xpGain = 0;
        moneyGain = 18 + Math.floor(minutes / 10);
        if (minutes >= 25 && rollLootbox(0.05)) lootboxes += 1;
        profile.totalVoiceMinutes += minutes;
    }

    profile.xp += xpGain;
    profile.money += moneyGain;
    profile.lootboxes += lootboxes;
    profile.level = getLevelFromXp(profile.xp);

    saveProfile(profile);

    const member = guild.members.cache.get(userId) || await guild.members.fetch(userId).catch(() => null);
    if (member && profile.level > beforeLevel) {
        await applyLevelRoleRewards(member, profile).catch(() => null);
    }

    return {
        profile,
        xpGain,
        moneyGain,
        lootboxes,
        levelUp: profile.level > beforeLevel,
        oldLevel: beforeLevel,
        newLevel: profile.level,
    };
}

async function registerMessageActivity(message) {
    if (!isJjkGuild(message.guild?.id) || message.author.bot) return null;

    const profile = refreshProfileState(loadProfile(message.guild.id, message.author.id), new Date());
    const meta = loadMessageMeta(message.guild.id, message.author.id);
    const quality = evaluateMessageQuality(meta, message.content);
    const now = Date.now();

    profile.totalMessages += 1;
    profile.lastChatAt = new Date(now).toISOString();

    if (!quality.meaningful) {
        profile.suspiciousMessages += 1;
        saveProfile(profile);
        meta.lastNormalized = quality.normalized || meta.lastNormalized;
        meta.recent = [...(meta.recent || []).slice(-5), { at: now, value: quality.normalized }];
        saveMessageMeta(message.guild.id, message.author.id, meta);
        return { awarded: false, reasons: quality.reasons, profile };
    }

    if (meta.lastRewardAt && (now - Number(meta.lastRewardAt)) < MESSAGE_REWARD_COOLDOWN_MS) {
        meta.lastNormalized = quality.normalized;
        meta.recent = [...(meta.recent || []).slice(-5), { at: now, value: quality.normalized }];
        saveMessageMeta(message.guild.id, message.author.id, meta);
        saveProfile(profile);
        return { awarded: false, reasons: ['cooldown'], profile };
    }

    meta.lastRewardAt = now;
    meta.lastNormalized = quality.normalized;
    meta.recent = [...(meta.recent || []).slice(-5), { at: now, value: quality.normalized }];
    saveMessageMeta(message.guild.id, message.author.id, meta);

    return {
        awarded: true,
        quality,
        ...(await grantProfileRewards({
            guild: message.guild,
            userId: message.author.id,
            source: 'chat',
            qualityScore: quality.score,
        })),
    };
}

async function registerCommandActivity({ guild, userId }) {
    if (!isJjkGuild(guild?.id)) return null;

    const meta = db.get(`jjk_command_cd_${guild.id}_${userId}`) || 0;
    const now = Date.now();
    if ((now - Number(meta)) < COMMAND_ACTIVITY_COOLDOWN_MS) {
        const profile = refreshProfileState(loadProfile(guild.id, userId), new Date());
        saveProfile(profile);
        return { awarded: false, profile };
    }

    db.set(`jjk_command_cd_${guild.id}_${userId}`, now);
    return {
        awarded: true,
        ...(await grantProfileRewards({
            guild,
            userId,
            source: 'command',
        })),
    };
}

function startVoiceSession(member) {
    if (!isJjkGuild(member.guild?.id) || member.user.bot) return;

    db.set(voiceSessionKey(member.guild.id, member.user.id), {
        startedAt: nowIso(),
        channelId: member.voice.channelId,
    });
}

function updateVoiceSession(member) {
    if (!isJjkGuild(member.guild?.id) || member.user.bot) return;

    const key = voiceSessionKey(member.guild.id, member.user.id);
    const current = db.get(key);
    if (!current?.startedAt) {
        startVoiceSession(member);
        return;
    }

    db.set(key, {
        ...current,
        channelId: member.voice.channelId,
    });
}

async function finishVoiceSession(member) {
    if (!isJjkGuild(member.guild?.id) || member.user.bot) return null;

    const key = voiceSessionKey(member.guild.id, member.user.id);
    const session = db.get(key);
    db.delete(key);

    if (!session?.startedAt) return null;

    const startedAt = new Date(session.startedAt);
    const minutes = Math.floor((Date.now() - startedAt.getTime()) / 60000);
    if (minutes < VOICE_SESSION_MINUTES) return { awarded: false, minutes };

    return {
        awarded: true,
        minutes,
        ...(await grantProfileRewards({
            guild: member.guild,
            userId: member.user.id,
            source: 'voice',
            minutes,
        })),
    };
}

function getBadgeMarkup(guildId, userId) {
    const badgeConfig = db.get(badgeConfigKey(guildId)) || {};
    const roles = badgeConfig.roles || {};
    const profileBadges = badgeConfig.members?.[userId] || [];
    const fromRoles = Object.entries(roles)
        .filter(([, config]) => config?.users?.includes?.(userId))
        .map(([, config]) => config.emoji || config.label)
        .filter(Boolean);
    return [...new Set([...profileBadges, ...fromRoles])].join(' ') || 'Sem emblemas lendários ainda.';
}

function getGraceStatus(profile, now = new Date()) {
    refreshProfileState(profile, now);
    if (!profile.pendingGrace?.graceEndsAt) return null;

    const endsAt = new Date(profile.pendingGrace.graceEndsAt);
    if (now > endsAt) return null;

    return {
        active: true,
        endsAt,
        remainingMs: Math.max(0, endsAt.getTime() - now.getTime()),
        previousStreak: profile.pendingGrace.previousStreak || 0,
    };
}

function getProfileView(guildId, userId) {
    const profile = refreshProfileState(loadProfile(guildId, userId), new Date());
    const progress = getLevelProgress(profile.xp);
    const grace = getGraceStatus(profile, new Date());
    const bonusPct = Math.round(getEffectiveStreakBonus(profile, new Date()) * 100);

    saveProfile(profile);

    return {
        profile,
        progress,
        progressBar: buildProgressBar(progress.ratio),
        grace,
        bonusPct,
        freezePrice: FREEZE_PRICE,
        badges: getBadgeMarkup(guildId, userId),
    };
}

async function buyFreeze({ guild, userId }) {
    if (!isJjkGuild(guild?.id)) {
        return { ok: false, reason: 'guild_invalida' };
    }

    const profile = refreshProfileState(loadProfile(guild.id, userId), new Date());
    const grace = getGraceStatus(profile, new Date());

    if (!grace?.active) {
        saveProfile(profile);
        return { ok: false, reason: 'sem_graca', profile };
    }

    if (profile.money < FREEZE_PRICE) {
        saveProfile(profile);
        return { ok: false, reason: 'sem_money', profile, missing: FREEZE_PRICE - profile.money };
    }

    profile.money -= FREEZE_PRICE;
    profile.streak = Math.max(profile.streak, grace.previousStreak + 1);
    profile.bestStreak = Math.max(profile.bestStreak, profile.streak);
    profile.lastStreakAwardDayKey = getBrazilDateKey(new Date());
    profile.lastMeaningfulActivityAt = nowIso();
    profile.pendingGrace = null;
    profile.streakPenaltyFactor = 0.75;
    profile.streakPenaltyUntil = new Date(Date.now() + STREAK_BREAK_MS).toISOString();

    saveProfile(profile);
    return { ok: true, profile };
}

async function applyLevelRoleRewards(member, profile) {
    const config = db.get(levelRoleConfigKey(member.guild.id)) || {};
    const milestones = Object.entries(config)
        .map(([level, roleId]) => ({ level: Number(level), roleId }))
        .filter((entry) => Number.isFinite(entry.level) && entry.level > 0 && entry.roleId)
        .sort((a, b) => a.level - b.level);

    if (!milestones.length) return;

    const eligible = milestones.filter((entry) => profile.level >= entry.level).map((entry) => entry.roleId);
    if (!eligible.length) return;

    const missingRoles = eligible.filter((roleId) => !member.roles.cache.has(roleId));
    if (!missingRoles.length) return;

    await member.roles.add(missingRoles).catch(() => null);
}

function buildShopView(guildId, userId) {
    const { profile, grace } = getProfileView(guildId, userId);

    return {
        profile,
        grace,
        items: [
            {
                id: 'congelamento',
                name: 'Congelamento',
                price: FREEZE_PRICE,
                description: 'Segura a queda do foguinho durante a janela de refrescagem e preserva a sequência, mas reduz o bônus da chama em 25% por um dia.',
                available: Boolean(grace?.active),
            },
        ],
    };
}

module.exports = {
    JJK_GUILD_ID,
    FREEZE_PRICE,
    isJjkGuild,
    getProfileView,
    buildShopView,
    buyFreeze,
    registerMessageActivity,
    registerCommandActivity,
    startVoiceSession,
    updateVoiceSession,
    finishVoiceSession,
    levelRoleConfigKey,
    badgeConfigKey,
    getBrazilDateKey,
    formatRelativeDuration,
};
