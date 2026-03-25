const OWNER_ID = process.env.OWNER_ID || '461660911107833856';

/**
 * Verifica se o ID do usuário é o dono do bot.
 * @param {string} userId
 * @returns {boolean}
 */
function isBotOwner(userId) {
    return String(userId) === String(OWNER_ID);
}

/**
 * Retorna o ID do dono do bot.
 * @returns {string}
 */
function getOwnerId() {
    return OWNER_ID;
}

/**
 * Rejeita a interação se o usuário não for o dono do bot.
 * Retorna true se bloqueado, false se autorizado.
 * @param {import('discord.js').Interaction | import('discord.js').Message} ctx
 * @returns {Promise<boolean>}
 */
async function requireOwner(ctx) {
    const userId = ctx.user?.id || ctx.author?.id;
    if (isBotOwner(userId)) return false;

    const msg = '🚫 Esse comando é exclusivo do dono do bot.';

    if (ctx.reply) {
        await ctx.reply({ content: msg, flags: ['Ephemeral'] }).catch(() => null);
    } else if (ctx.channel) {
        await ctx.channel.send(msg).catch(() => null);
    }

    return true;
}

module.exports = { isBotOwner, getOwnerId, requireOwner };
