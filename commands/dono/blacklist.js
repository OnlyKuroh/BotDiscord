const {
    SlashCommandBuilder,
    MessageFlags,
} = require('discord.js');
const { requireOwner } = require('../../utils/owner');
const db = require('../../utils/db');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('blacklist')
        .setDescription('[DONO] Gerencia a blacklist de servidores.')
        .addSubcommand(sub =>
            sub.setName('add')
                .setDescription('Adiciona um servidor à blacklist.')
                // Ordem reforçada: obrigatórios antes dos opcionais
                .addStringOption(o => o.setName('guild_id').setDescription('ID do servidor').setRequired(true))
                .addStringOption(o => o.setName('motivo').setDescription('Motivo do bloqueio').setRequired(false))
        )
        .addSubcommand(sub =>
            sub.setName('remove')
                .setDescription('Remove um servidor da blacklist.')
                .addStringOption(o => o.setName('guild_id').setDescription('ID do servidor').setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName('listar')
                .setDescription('Lista todos os servidores na blacklist.')
        )
        .addSubcommand(sub =>
            sub.setName('check')
                .setDescription('Verifica se um servidor está na blacklist.')
                .addStringOption(o => o.setName('guild_id').setDescription('ID do servidor').setRequired(true))
        ),
    aliases: ['bl'],
    category: 'dono',
    detailedDescription: 'Gerencia a blacklist de servidores. Servidores na blacklist não podem usar nenhum comando.',
    usage: '`/blacklist <add|remove|listar|check> [guild_id] [motivo]`',
    permissions: ['Dono do bot'],

    async execute(interaction, client) {
        if (await requireOwner(interaction)) return;

        const sub = interaction.options.getSubcommand();
        await interaction.deferReply({ flags: ['Ephemeral'] });

        if (sub === 'add') {
            const guildId = interaction.options.getString('guild_id', true).trim();
            const motivo = interaction.options.getString('motivo') || 'Sem motivo informado.';
            db.blacklistGuild(guildId, motivo, interaction.user.id);

            // Tenta sair do servidor automaticamente
            const guild = client.guilds.cache.get(guildId);
            if (guild) {
                await guild.leave().catch(() => null);
                return interaction.editReply(`🔴 Servidor **${guild.name}** (\`${guildId}\`) adicionado à blacklist e bot saiu do servidor.\n**Motivo:** ${motivo}`);
            }

            return interaction.editReply(`🔴 \`${guildId}\` adicionado à blacklist.\n**Motivo:** ${motivo}\n*(Servidor não estava no cache — bot pode continuar lá até o próximo restart.)*`);
        }

        if (sub === 'remove') {
            const guildId = interaction.options.getString('guild_id', true).trim();
            db.unblacklistGuild(guildId);
            return interaction.editReply(`🟢 \`${guildId}\` removido da blacklist.`);
        }

        if (sub === 'listar') {
            const list = db.getBlacklist();
            if (list.length === 0) return interaction.editReply('✅ Nenhum servidor na blacklist.');

            const lines = list.map((entry, i) => {
                const guild = client.guilds.cache.get(entry.guild_id);
                const name = guild ? guild.name : 'Servidor desconhecido';
                return `**${i + 1}.** ${name} (\`${entry.guild_id}\`)\n   Motivo: ${entry.reason || 'N/A'} • ${new Date(entry.blocked_at).toLocaleDateString('pt-BR')}`;
            }).join('\n\n');

            return interaction.editReply(`🔴 **Blacklist (${list.length}):**\n\n${lines}`.slice(0, 1900));
        }

        if (sub === 'check') {
            const guildId = interaction.options.getString('guild_id', true).trim();
            const blocked = db.isGuildBlacklisted(guildId);
            const guild = client.guilds.cache.get(guildId);
            const name = guild ? guild.name : guildId;
            return interaction.editReply(blocked
                ? `🔴 **${name}** está na blacklist.`
                : `🟢 **${name}** não está na blacklist.`
            );
        }
    },

    async executePrefix(message, args, client) {
        if (await requireOwner(message)) return;

        const [sub, guildId, ...rest] = args;
        if (!sub) return message.reply('Uso: `-blacklist <add|remove|listar|check> [guild_id] [motivo]`');

        if (sub === 'add') {
            if (!guildId) return message.reply('Informe o ID do servidor.');
            const motivo = rest.join(' ') || 'Sem motivo.';
            db.blacklistGuild(guildId, motivo, message.author.id);
            const guild = client.guilds.cache.get(guildId);
            if (guild) await guild.leave().catch(() => null);
            return message.reply(`🔴 \`${guildId}\` adicionado à blacklist. Motivo: ${motivo}`);
        }
        if (sub === 'remove') {
            if (!guildId) return message.reply('Informe o ID do servidor.');
            db.unblacklistGuild(guildId);
            return message.reply(`🟢 \`${guildId}\` removido da blacklist.`);
        }
        if (sub === 'listar') {
            const list = db.getBlacklist();
            if (list.length === 0) return message.reply('Nenhum servidor na blacklist.');
            return message.reply(`Blacklist (${list.length}):\n` + list.map(e => `• \`${e.guild_id}\` — ${e.reason || 'N/A'}`).join('\n'));
        }
        if (sub === 'check') {
            if (!guildId) return message.reply('Informe o ID do servidor.');
            return message.reply(db.isGuildBlacklisted(guildId) ? `🔴 \`${guildId}\` está na blacklist.` : `🟢 \`${guildId}\` não está na blacklist.`);
        }
    },
};
