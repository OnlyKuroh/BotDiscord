const { ShardingManager } = require('discord.js');
require('dotenv').config();

const manager = new ShardingManager('./index.js', {
    token: process.env.DISCORD_TOKEN,
    totalShards: 'auto',
    mode: 'process',
});

manager.on('shardCreate', shard => {
    console.log(`[SHARD] Lançando shard #${shard.id}`);
    shard.on('ready', () => console.log(`[SHARD #${shard.id}] Pronto`));
    shard.on('disconnect', () => console.warn(`[SHARD #${shard.id}] Desconectado`));
    shard.on('reconnecting', () => console.log(`[SHARD #${shard.id}] Reconectando...`));
    shard.on('error', err => console.error(`[SHARD #${shard.id}] Erro:`, err));
});

manager.spawn();
