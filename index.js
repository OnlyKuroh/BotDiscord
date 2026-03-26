require('dotenv').config();
const { Client, GatewayIntentBits, Collection, Partials } = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.DirectMessages,
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

client.commands = new Collection();
client.aliases = new Collection();
client.prefix = '-';

require('./handlers/command')(client);
require('./handlers/event')(client);

process.on('unhandledRejection', async (reason, promise) => {
    console.log('[ANTI-CRASH] Unhandled Rejection:', reason);
    sendLogError(client, '🔥 Fuga do Controle (Unhandled Rejection)', String(reason));
});
process.on('uncaughtException', async (err) => {
    console.log('[ANTI-CRASH] Uncaught Exception:', err);
    sendLogError(client, '🚨 Falha Crítica na Lâmina (Uncaught Exception)', String(err.stack || err));
});
process.on('uncaughtExceptionMonitor', async (err, origin) => {
    console.log('[ANTI-CRASH] Uncaught Exception Monitor:', err, origin);
});

async function sendLogError(client, title, description) {
    const db = require('./utils/db');
    db.addLog('SYSTEM_ERROR', `${title} | ${String(description).slice(0, 1200)}`, null, null, 'Process Monitor');
    // Procuramos globalmente ou no primeiro cache (o ideal é espalhar pra todos que ativaram)
    // Para simplificar: enviamos ao menos pro primeiro servidor que o bot está e tem log definido.
    client.guilds.cache.forEach(async guild => {
        const logChannelId = db.get(`logs_${guild.id}`);
        if (!logChannelId) return;
        const channel = guild.channels.cache.get(logChannelId);
        if (!channel) return;

        const { EmbedBuilder } = require('discord.js');
        const embed = new EmbedBuilder()
            .setColor('#000000') // O fim de tudo
            .setAuthor({ name: 'Sistema Sanguínio do Bot Comprometido' })
            .setTitle(title)
            .setDescription(`\`\`\`js\n${description.slice(0, 4000)}\n\`\`\``) // Garante o limite do discord
            .setTimestamp();
        
        await channel.send({ embeds: [embed] }).catch(() => null);
    });
}

client.login(process.env.DISCORD_TOKEN).then(() => {
    require('./handlers/dashboard')(client);
    require('./handlers/events-scheduler').start(client);
    require('./utils/update-notifier').start(client);
    require('./utils/lol-dm-tracker').start(client);
    require('./utils/lol-player-index').start();
    const tempCommands = require('./utils/temp-command-window');
    tempCommands.ensureWindow();
    tempCommands.scheduleCleanup(client);
    void tempCommands.cleanupTemporaryCommands(client);
});
