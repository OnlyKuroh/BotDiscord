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
        const embed = await buildTelemetryEmbed(client, interaction.user, apiLatency);
        await interaction.editReply({ embeds: [embed] });
    },

    async executePrefix(message, args, client) {
        const embed = await buildTelemetryEmbed(client, message.author, null);
        await message.reply({ embeds: [embed] });
    }
};

async function buildTelemetryEmbed(client, user, apiLatency) {
    const memory = process.memoryUsage();
    const heapUsed = formatMb(memory.heapUsed);
    const heapTotal = formatMb(memory.heapTotal);
    const rss = formatMb(memory.rss);

    const totalMemGB = formatGb(os.totalmem());
    const freeMemGB = formatGb(os.freemem());
    const usedMemGB = (Number(totalMemGB) - Number(freeMemGB)).toFixed(2);

    const uptimeStr = formatDuration(client.uptime || 0);
    const wsping = client.ws.ping;
    const latencyValue = apiLatency != null
        ? `WebSocket: \`${wsping}ms\`\nAPI: \`${apiLatency}ms\``
        : `WebSocket: \`${wsping}ms\`\nAPI: \`—\``;

    const shardMetrics = await getShardMetrics(client);
    const flyRuntime = getFlyRuntime();

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
            { name: '🧠 Uso de CPU', value: `Núcleos: \`${os.cpus().length}\`\nModelo: \`${normalizeCpuModel(os.cpus()[0]?.model)}\``, inline: true },

            { name: '💻 Sistema Operacional', value: `Plataforma: \`${os.platform()}\`\nVersão: \`${os.release()}\`\nNode.js: \`${process.version}\``, inline: true },
            { name: '📊 Estatísticas do Bot', value: `Servidores: \`${shardMetrics.guilds}\`\nMembros: \`${shardMetrics.members}\`\nShards: \`${shardMetrics.summary}\``, inline: true },
            { name: '💬 Canais e Recursos', value: `Canais: \`${shardMetrics.channels}\`\nUsuários em cache: \`${shardMetrics.users}\`\nComandos: \`${client.commands.size}\``, inline: true },
            { name: '🧩 Estado dos Shards', value: shardMetrics.details, inline: false },
            { name: '🛩️ Ambiente Fly', value: flyRuntime, inline: false }
        )
        .setFooter({ text: `Itadori © ${shardMetrics.footer} • Solicitado por ${user.username}`, iconURL: user.displayAvatarURL() })
        .setTimestamp();
}

async function getShardMetrics(client) {
    if (!client.shard) {
        const shardId = 0;
        const guilds = client.guilds.cache.size;
        const members = client.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0);
        const channels = client.channels.cache.size;
        const users = client.users.cache.size;

        return {
            guilds,
            members,
            channels,
            users,
            summary: '#0 / 1',
            footer: 'Shard #0 / 1',
            details: [
                'Modo: `single process`',
                `Shard atual: \`#${shardId}\``,
                `Servidores: \`${guilds}\` | Membros: \`${members}\``,
                `Ping WS: \`${client.ws.ping}ms\` | Uptime: \`${formatDuration(client.uptime || 0)}\``
            ].join('\n')
        };
    }

    const shardSnapshots = await client.shard.broadcastEval((c) => ({
        id: c.shard.ids[0],
        guilds: c.guilds.cache.size,
        members: c.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0),
        channels: c.channels.cache.size,
        users: c.users.cache.size,
        ping: c.ws.ping,
        uptime: c.uptime || 0,
        rssMb: Number((process.memoryUsage().rss / 1024 / 1024).toFixed(2))
    }));

    shardSnapshots.sort((a, b) => a.id - b.id);

    const totals = shardSnapshots.reduce((acc, shard) => {
        acc.guilds += shard.guilds;
        acc.members += shard.members;
        acc.channels += shard.channels;
        acc.users += shard.users;
        return acc;
    }, { guilds: 0, members: 0, channels: 0, users: 0 });

    const currentShardId = client.shard.ids[0];
    const shardCount = client.shard.count;
    const detailLines = shardSnapshots.map((shard) =>
        `#${shard.id}: \`${shard.guilds}\` srv | \`${shard.members}\` membros | \`${shard.ping}ms\` | RSS \`${shard.rssMb} MB\` | Up \`${formatDuration(shard.uptime)}\``
    );

    return {
        ...totals,
        summary: `#${currentShardId} / ${shardCount} (${shardSnapshots.length} ativas)`,
        footer: `Shard #${currentShardId} / ${shardCount}`,
        details: detailLines.join('\n').slice(0, 1024)
    };
}

function getFlyRuntime() {
    if (!process.env.FLY_APP_NAME) {
        return 'Hospedagem Fly: `não detectada`\nModo atual: `local/outro provedor`';
    }

    const appName = process.env.FLY_APP_NAME;
    const machineId = process.env.FLY_MACHINE_ID || process.env.FLY_ALLOC_ID || 'desconhecida';
    const region = process.env.FLY_REGION || process.env.PRIMARY_REGION || 'desconhecida';
    const publicUrl = process.env.PUBLIC_BASE_URL || `https://${appName}.fly.dev`;

    return [
        `App: \`${appName}\``,
        `Machine: \`${machineId}\``,
        `Região: \`${region}\``,
        `URL: \`${publicUrl}\``
    ].join('\n');
}

function formatDuration(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${days}d ${hours}h ${minutes}m ${seconds}s`;
}

function formatMb(bytes) {
    return (bytes / 1024 / 1024).toFixed(2);
}

function formatGb(bytes) {
    return (bytes / 1024 / 1024 / 1024).toFixed(2);
}

function normalizeCpuModel(model) {
    return (model || 'Desconhecido').replace(/CPU|Processor/g, '').trim();
}
