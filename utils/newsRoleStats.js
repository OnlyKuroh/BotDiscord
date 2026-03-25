const db = require('./db');

function getCounterKey(guildId, eventKey) {
    return `news_role_count_${guildId}_${eventKey}`;
}

function getTrackedEvents(guildId) {
    const eventsConfig = db.get(`events_${guildId}`) || {};
    return Object.entries(eventsConfig).filter(([, conf]) => conf?.roleId);
}

function getStoredCount(guildId, eventKey) {
    const value = db.get(getCounterKey(guildId, eventKey));
    return Number.isInteger(value) ? value : null;
}

function setStoredCount(guildId, eventKey, count) {
    db.set(getCounterKey(guildId, eventKey), Math.max(0, count));
}

function incrementStoredCount(guildId, eventKey, amount = 1) {
    const current = getStoredCount(guildId, eventKey) ?? 0;
    setStoredCount(guildId, eventKey, current + amount);
}

function decrementStoredCount(guildId, eventKey, amount = 1) {
    const current = getStoredCount(guildId, eventKey) ?? 0;
    setStoredCount(guildId, eventKey, current - amount);
}

function getNewsStatsSnapshot(guild) {
    const stats = {};

    for (const [eventKey, conf] of getTrackedEvents(guild.id)) {
        const role = guild.roles.cache.get(conf.roleId);
        const stored = getStoredCount(guild.id, eventKey);
        const fallback = role ? role.members.size : 0;
        const count = stored ?? fallback;

        if (stored === null) {
            setStoredCount(guild.id, eventKey, count);
        }

        stats[eventKey] = count;
    }

    return stats;
}

function syncRoleCounterDiff(oldMember, newMember) {
    for (const [eventKey, conf] of getTrackedEvents(newMember.guild.id)) {
        const hadRole = oldMember.roles.cache.has(conf.roleId);
        const hasRole = newMember.roles.cache.has(conf.roleId);

        if (hadRole === hasRole) continue;

        if (hasRole) incrementStoredCount(newMember.guild.id, eventKey);
        else decrementStoredCount(newMember.guild.id, eventKey);
    }
}

function handleMemberLeave(member) {
    for (const [eventKey, conf] of getTrackedEvents(member.guild.id)) {
        if (member.roles.cache.has(conf.roleId)) {
            decrementStoredCount(member.guild.id, eventKey);
        }
    }
}

module.exports = {
    getNewsStatsSnapshot,
    syncRoleCounterDiff,
    handleMemberLeave,
    setStoredCount,
};
