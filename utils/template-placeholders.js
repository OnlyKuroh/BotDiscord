/**
 * Placeholder notes for future site/editor:
 * - Use `${OWNER}` for owner mention
 * - Use `${USER}` for user mention
 * - Use `${CHANNEL}` for channel mention
 * - Use `${GUILD_NAME}` for guild name
 *
 * This is intentionally separate from the old @USER / #canal style so the
 * dashboard can support cleaner tokenized templates later on.
 */

function renderTemplatePlaceholders(template, context = {}) {
    const values = {
        OWNER: context.ownerMention || '',
        USER: context.userMention || '',
        CHANNEL: context.channelMention || '',
        GUILD_NAME: context.guildName || '',
        OWNER_NAME: context.ownerName || '',
        USER_NAME: context.userName || '',
    };

    return String(template || '').replace(/\$\{([A-Z_]+)\}/g, (_, key) => {
        return values[key] != null ? String(values[key]) : '';
    });
}

module.exports = {
    renderTemplatePlaceholders,
};
