const { REST, Routes } = require('discord.js');
const db = require('./db');

const WINDOW_KEY = 'temp_spy_commands_window';
const TEMP_COMMAND_NAMES = ['spysay', 'msgpriv', 'spycheck'];
const WINDOW_HOURS = 3;

let cleanupTimer = null;

function getWindow() {
    return db.get(WINDOW_KEY) || null;
}

function ensureWindow() {
    const current = getWindow();
    if (current?.expiresAt) return current;

    const now = Date.now();
    const window = {
        createdAt: new Date(now).toISOString(),
        expiresAt: new Date(now + WINDOW_HOURS * 60 * 60 * 1000).toISOString(),
    };
    db.set(WINDOW_KEY, window);
    return window;
}

function isWindowActive() {
    const window = ensureWindow();
    return Date.now() < new Date(window.expiresAt).getTime();
}

async function cleanupTemporaryCommands(client) {
    const window = getWindow();
    if (!window?.expiresAt) return;
    if (Date.now() < new Date(window.expiresAt).getTime()) return;

    try {
        const rest = new REST().setToken(process.env.DISCORD_TOKEN);
        const guildIds = client.guilds.cache.map((guild) => guild.id);

        for (const guildId of guildIds) {
            const commands = await rest.get(
                Routes.applicationGuildCommands(process.env.CLIENT_ID, guildId)
            ).catch(() => []);

            for (const command of commands) {
                if (!TEMP_COMMAND_NAMES.includes(command.name)) continue;
                await rest.delete(
                    Routes.applicationGuildCommand(process.env.CLIENT_ID, guildId, command.id)
                ).catch(() => null);
            }
        }
    } catch (error) {
        console.error('[TEMP COMMANDS] Falha ao limpar slash temporarios:', error.message);
    }
}

function scheduleCleanup(client) {
    const window = ensureWindow();
    const delay = Math.max(5000, new Date(window.expiresAt).getTime() - Date.now());

    if (cleanupTimer) clearTimeout(cleanupTimer);
    cleanupTimer = setTimeout(() => {
        void cleanupTemporaryCommands(client);
    }, delay);
}

module.exports = {
    ensureWindow,
    isWindowActive,
    cleanupTemporaryCommands,
    scheduleCleanup,
};
