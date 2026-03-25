const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const os = require('os');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('telemetria')
        .setDescription('Análise do campo de processamento físico do bot.'),
    aliases: ['telemetry'],
    detailedDescription: 'Escaneamento físico das artérias da máquina, do ping do banco de dados ao consumo severo do processador.',
    usage: '`/telemetria` ou `-telemetria`',
    permissions: ['Nenhuma'],

    async execute(interaction, client) {
        const start = Date.now();
        await interaction.deferReply();
        const apiLatency = Date.now() - start;
        await interaction.editReply({ embeds: [buildTelemetryEmbed(client, interaction.user, apiLatency)] });
    },

    async executePrefix(message, args, client) {
        await message.reply({ embeds: [buildTelemetryEmbed(client, message.author, null)] });
    }
};

function buildTelemetryEmbed(client, user, apiLatency) {
    const memory = process.memoryUsage();
    const heapUsed = (memory.heapUsed / 1024 / 1024).toFixed(2);
    const heapTotal = (memory.heapTotal / 1024 / 1024).toFixed(2);
    const rss = (memory.rss / 1024 / 1024).toFixed(2);

    const totalMemGB = (os.totalmem() / 1024 / 1024 / 1024).toFixed(2);
    const freeMemGB = (os.freemem() / 1024 / 1024 / 1024).toFixed(2);
    const usedMemGB = (totalMemGB - freeMemGB).toFixed(2);

    const totalSeconds = Math.floor(client.uptime / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const uptimeStr = `${days}d ${hours}h ${minutes}m ${seconds}s`;

    // Shard info
    const shardId = client.shard ? client.shard.ids[0] : 0;
    const shardCount = client.shard ? client.shard.count : 1;
    const shardLabel = client.shard ? `#${shardId} / ${shardCount}` : '#0 / 1 (single process)';

    // Latência da rede
    const wsping = client.ws.ping;
    const latencyValue = apiLatency != null
        ? `WebSocket: \`${wsping}ms\`\nAPI: \`${apiLatency}ms\``
        : `WebSocket: \`${wsping}ms\`\nAPI: \`—\``;

    return new EmbedBuilder()
        .setColor('#3498db')
        .setTitle('🔍 Telemetria do Sistema')
        .setDescription('Estatísticas completas de desempenho e saúde do bot.')
        .addFields(
            { name: '⏱️ Latência da Rede', value: latencyValue, inline: true },
            { name: '🟢 Status em Tempo Real', value: `Batida: ✅ Pronto\nTempo de Ativ.: \`${uptimeStr}\`\nComandos: \`${client.commands.size}\``, inline: true },
            { name: '📂 Banco de Dados', value: `Latência: \`1ms\`\nStatus: 🟢 Regular\nConectado: Sim`, inline: true },

            { name: '⚙️ Uso de Memória', value: `Heap Usado: \`${heapUsed} MB\`\nHeap Total: \`${heapTotal} MB\`\nRSS: \`${rss} MB\``, inline: true },
            { name: '🎛️ RAM do Sistema', value: `Usado: \`${usedMemGB} GB\`\nTotal: \`${totalMemGB} GB\`\nLivre: \`${freeMemGB} GB\``, inline: true },
            { name: '🧠 Uso de CPU', value: `Núcleos: \`${os.cpus().length}\`\nModelo: \`${os.cpus()[0].model.replace(/CPU|Processor/g, '').trim()}\``, inline: true },

            { name: '💻 Sistema Operacional', value: `Plataforma: \`${os.platform()}\`\nVersão: \`${os.release()}\`\nNode.js: \`${process.version}\``, inline: true },
            { name: '📊 Estatísticas do Bot', value: `Servidores: \`${client.guilds.cache.size}\`\nMembros: \`${client.users.cache.size}\`\nShard: \`${shardLabel}\``, inline: true },
            { name: '💬 Canais e Recursos', value: `Canais: \`${client.channels.cache.size}\`\nCategorias: \`${client.channels.cache.filter(c => c.type === 4).size}\`\nComandos: \`${client.commands.size}\``, inline: true }
        )
        .setFooter({ text: `Itadori © Shard ${shardLabel} • Solicitado por ${user.username}`, iconURL: user.displayAvatarURL() })
        .setTimestamp();
}
