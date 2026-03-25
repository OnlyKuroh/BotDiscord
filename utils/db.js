const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const isFly = Boolean(process.env.FLY_APP_NAME);
const dataDir = process.env.DATA_DIR || (isFly ? '/data' : path.join(__dirname, '..', 'data'));
const dbPath = process.env.DB_PATH || path.join(dataDir, 'database.db');

// Garante que o diretório data exista
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(dbPath);

// Criação da tabela para manter compatibilidade com o formato chave-valor
db.prepare(`
    CREATE TABLE IF NOT EXISTS kv_store (
        key TEXT PRIMARY KEY,
        value TEXT
    )
`).run();

db.prepare(`
    CREATE TABLE IF NOT EXISTS activity_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT,
        content TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        guild_id TEXT,
        user_id TEXT,
        user_name TEXT
    )
`).run();

db.prepare(`
    CREATE TABLE IF NOT EXISTS stats_store (
        key TEXT PRIMARY KEY,
        value INTEGER DEFAULT 0
    )
`).run();

db.prepare("INSERT OR IGNORE INTO stats_store (key, value) VALUES ('slash_commands_used', 0)").run();

// Tabela de comandos personalizados por servidor
db.prepare(`
    CREATE TABLE IF NOT EXISTS custom_commands (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        trigger TEXT NOT NULL,
        trigger_type TEXT NOT NULL DEFAULT 'prefix',
        response TEXT NOT NULL,
        response_type TEXT NOT NULL DEFAULT 'text',
        embed_data TEXT,
        required_role_id TEXT,
        cooldown_seconds INTEGER DEFAULT 0,
        enabled INTEGER DEFAULT 1,
        created_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(guild_id, trigger, trigger_type)
    )
`).run();

// Tabela de blacklist de servidores
db.prepare(`
    CREATE TABLE IF NOT EXISTS guild_blacklist (
        guild_id TEXT PRIMARY KEY,
        reason TEXT,
        blocked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        blocked_by TEXT
    )
`).run();

/**
 * Adiciona um log de atividade
 */
function addLog(type, content, guild_id, user_id, user_name) {
    db.prepare('INSERT INTO activity_logs (type, content, guild_id, user_id, user_name) VALUES (?, ?, ?, ?, ?)').run(type, content, guild_id, user_id, user_name);
}

/**
 * Pega os últimos logs
 */
function getLogs(limit = 50) {
    return db.prepare('SELECT * FROM activity_logs ORDER BY timestamp DESC LIMIT ?').all(limit);
}

/**
 * Pega um valor do banco de dados
 * @param {string} key 
 */
function get(key) {
    const row = db.prepare('SELECT value FROM kv_store WHERE key = ?').get(key);
    if (!row) return undefined;
    try {
        return JSON.parse(row.value);
    } catch (e) {
        return row.value;
    }
}

/**
 * Salva um valor no banco de dados
 * @param {string} key 
 * @param {any} value 
 */
function set(key, value) {
    const stringValue = JSON.stringify(value);
    db.prepare('INSERT OR REPLACE INTO kv_store (key, value) VALUES (?, ?)').run(key, stringValue);
}

/**
 * Deleta uma chave do banco
 * @param {string} key 
 */
function deleteKey(key) {
    db.prepare('DELETE FROM kv_store WHERE key = ?').run(key);
}

/**
 * Incrementa um valor estatístico
 */
function incrementStat(key) {
    db.prepare("UPDATE stats_store SET value = value + 1 WHERE key = ?").run(key);
}

/**
 * Pega um valor estatístico
 */
function getStat(key) {
    const res = db.prepare("SELECT value FROM stats_store WHERE key = ?").get(key);
    return res ? res.value : 0;
}

// ─── Custom Commands ──────────────────────────────────────────────────────────

function getCustomCommands(guildId) {
    return db.prepare('SELECT * FROM custom_commands WHERE guild_id = ? ORDER BY trigger ASC').all(guildId);
}

function getCustomCommand(guildId, trigger, triggerType) {
    return db.prepare('SELECT * FROM custom_commands WHERE guild_id = ? AND trigger = ? AND trigger_type = ?').get(guildId, trigger, triggerType);
}

function setCustomCommand({ guildId, trigger, triggerType, response, responseType, embedData, requiredRoleId, cooldownSeconds, createdBy }) {
    db.prepare(`
        INSERT INTO custom_commands (guild_id, trigger, trigger_type, response, response_type, embed_data, required_role_id, cooldown_seconds, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(guild_id, trigger, trigger_type) DO UPDATE SET
            response = excluded.response,
            response_type = excluded.response_type,
            embed_data = excluded.embed_data,
            required_role_id = excluded.required_role_id,
            cooldown_seconds = excluded.cooldown_seconds
    `).run(
        guildId,
        trigger,
        triggerType || 'prefix',
        response,
        responseType || 'text',
        embedData ? JSON.stringify(embedData) : null,
        requiredRoleId || null,
        cooldownSeconds || 0,
        createdBy || null
    );
}

function deleteCustomCommand(guildId, trigger, triggerType) {
    db.prepare('DELETE FROM custom_commands WHERE guild_id = ? AND trigger = ? AND trigger_type = ?').run(guildId, trigger, triggerType);
}

function toggleCustomCommand(guildId, trigger, triggerType, enabled) {
    db.prepare('UPDATE custom_commands SET enabled = ? WHERE guild_id = ? AND trigger = ? AND trigger_type = ?').run(enabled ? 1 : 0, guildId, trigger, triggerType);
}

// ─── Guild Blacklist ──────────────────────────────────────────────────────────

function blacklistGuild(guildId, reason, blockedBy) {
    db.prepare('INSERT OR REPLACE INTO guild_blacklist (guild_id, reason, blocked_by) VALUES (?, ?, ?)').run(guildId, reason || null, blockedBy || null);
}

function unblacklistGuild(guildId) {
    db.prepare('DELETE FROM guild_blacklist WHERE guild_id = ?').run(guildId);
}

function isGuildBlacklisted(guildId) {
    return Boolean(db.prepare('SELECT 1 FROM guild_blacklist WHERE guild_id = ?').get(guildId));
}

function getBlacklist() {
    return db.prepare('SELECT * FROM guild_blacklist ORDER BY blocked_at DESC').all();
}

function getLogsForGuild(guildId, limit = 50) {
    return db.prepare('SELECT * FROM activity_logs WHERE guild_id = ? ORDER BY timestamp DESC LIMIT ?').all(guildId, limit);
}

module.exports = {
    get, set, delete: deleteKey, addLog, getLogs, getLogs, incrementStat, getStat,
    getCustomCommands, getCustomCommand, setCustomCommand, deleteCustomCommand, toggleCustomCommand,
    blacklistGuild, unblacklistGuild, isGuildBlacklisted, getBlacklist, getLogsForGuild,
};
