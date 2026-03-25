const db = require('./db');

/**
 * Atualiza o nome do canal de voz configurado como contador de membros.
 * Discord limita a 2 mudanças de nome por 10 minutos — é o esperado para este tipo de canal.
 */
async function updateMemberCounter(guild) {
    const channelId = db.get(`member_counter_${guild.id}`);
    if (!channelId) return;

    const channel = guild.channels.cache.get(channelId);
    if (!channel) return;

    const count = guild.memberCount;
    const newName = `👥 Membros: ${count.toLocaleString('pt-BR')}`;

    if (channel.name === newName) return; // sem mudança, não gasta rate limit

    await channel.setName(newName).catch(() => null);
}

module.exports = updateMemberCounter;
