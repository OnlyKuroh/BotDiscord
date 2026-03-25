const {
    SlashCommandBuilder,
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    MessageFlags,
} = require('discord.js');
const { requireOwner } = require('../../utils/owner');
const db = require('../../utils/db');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ia-global')
        .setDescription('[DONO] Gerencia a IA Itadori globalmente.')
        .addSubcommand(sub =>
            sub.setName('stats')
                .setDescription('Vê sessões ativas, cooldowns e usuários bloqueados.')
        )
        .addSubcommand(sub =>
            sub.setName('desbloquear')
                .setDescription('Remove o bloqueio de IA de um usuário em um servidor.')
                .addStringOption(o => o.setName('guild_id').setDescription('ID do servidor').setRequired(true))
                .addStringOption(o => o.setName('user_id').setDescription('ID do usuário').setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName('config-guild')
                .setDescription('Configura a IA para um servidor específico.')
                .addStringOption(o => o.setName('guild_id').setDescription('ID do servidor').setRequired(true))
                .addBooleanOption(o => o.setName('dm_mode').setDescription('Responder no privado do usuário?').setRequired(false))
                .addBooleanOption(o => o.setName('enabled').setDescription('Habilitar ou desabilitar a IA neste servidor?').setRequired(false))
                .addIntegerOption(o => o.setName('hora_inicio').setDescription('Hora de início (0-23) para o bot responder').setMinValue(0).setMaxValue(23).setRequired(false))
                .addIntegerOption(o => o.setName('hora_fim').setDescription('Hora de fim (0-23) para o bot responder').setMinValue(0).setMaxValue(23).setRequired(false))
        )
        .addSubcommand(sub =>
            sub.setName('ver-config')
                .setDescription('Ver a configuração de IA de um servidor.')
                .addStringOption(o => o.setName('guild_id').setDescription('ID do servidor').setRequired(true))
        ),
    aliases: ['ia-admin'],
    category: 'dono',
    detailedDescription: 'Gerenciamento global da IA Itadori: estatísticas, desbloqueio de usuários, configuração por servidor.',
    usage: '`/ia-global <stats|desbloquear|config-guild|ver-config>`',
    permissions: ['Dono do bot'],

    async execute(interaction, client) {
        if (await requireOwner(interaction)) return;

        const sub = interaction.options.getSubcommand();
        await interaction.deferReply({ flags: ['Ephemeral'] });

        if (sub === 'stats') {
            // Pega todas as chaves de sessão, cooldown e bloqueio da DB
            const allKeys = db._rawKeys ? db._rawKeys() : [];

            // Vamos contar via prefixo
            const sessions = [];
            const blocked = [];
            const cooldowns = [];

            // Busca no kv_store
            const Database = require('better-sqlite3');
            const path = require('path');
            const rawDb = new Database(path.join(__dirname, '../../data/database.db'), { readonly: true });
            const rows = rawDb.prepare("SELECT key FROM kv_store WHERE key LIKE 'itadori_chat_%'").all();
            rawDb.close();

            for (const row of rows) {
                const k = row.key;
                if (k.includes('_session_')) sessions.push(k);
                else if (k.includes('_blocked_')) blocked.push(k);
                else if (k.includes('_cooldown_')) cooldowns.push(k);
            }

            const container = new ContainerBuilder().setAccentColor(0xC41230);
            container.addTextDisplayComponents(new TextDisplayBuilder().setContent('## 🤖 IA Itadori — Stats Globais'));
            container.addSeparatorComponents(new SeparatorBuilder());
            container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
                `**Sessões ativas:** ${sessions.length}\n**Usuários em cooldown:** ${cooldowns.length}\n**Usuários bloqueados:** ${blocked.length}`
            ));

            if (blocked.length > 0) {
                const blockedLines = blocked.slice(0, 10).map(k => {
                    const parts = k.replace('itadori_chat_blocked_', '').split('_');
                    const userId = parts.pop();
                    const guildId = parts.join('_');
                    return `• Guild \`${guildId}\` — User \`${userId}\``;
                }).join('\n');
                container.addSeparatorComponents(new SeparatorBuilder());
                container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Bloqueados (até 10):**\n${blockedLines}`));
            }

            return interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        if (sub === 'desbloquear') {
            const guildId = interaction.options.getString('guild_id', true);
            const userId = interaction.options.getString('user_id', true);
            db.delete(`itadori_chat_blocked_${guildId}_${userId}`);
            db.delete(`itadori_chat_cooldown_${guildId}_${userId}`);
            db.delete(`itadori_chat_session_${guildId}_${userId}`);
            return interaction.editReply(`✅ Usuário \`${userId}\` desbloqueado da IA no servidor \`${guildId}\`.`);
        }

        if (sub === 'config-guild') {
            const guildId = interaction.options.getString('guild_id', true);
            const current = db.get(`ia_config_${guildId}`) || {};
            const dmMode = interaction.options.getBoolean('dm_mode');
            const enabled = interaction.options.getBoolean('enabled');
            const horaInicio = interaction.options.getInteger('hora_inicio');
            const horaFim = interaction.options.getInteger('hora_fim');

            const updated = {
                ...current,
                ...(dmMode !== null ? { dmMode } : {}),
                ...(enabled !== null ? { enabled } : {}),
                ...(horaInicio !== null ? { horaInicio } : {}),
                ...(horaFim !== null ? { horaFim } : {}),
            };

            db.set(`ia_config_${guildId}`, updated);

            const lines = [
                `✅ Config de IA atualizada para \`${guildId}\`:`,
                `• Habilitada: ${updated.enabled !== false ? 'Sim' : 'Não'}`,
                `• Modo DM: ${updated.dmMode ? 'Sim' : 'Não'}`,
                `• Janela de horário: ${updated.horaInicio !== undefined ? `${updated.horaInicio}h – ${updated.horaFim}h` : 'Sem restrição'}`,
            ].join('\n');

            return interaction.editReply(lines);
        }

        if (sub === 'ver-config') {
            const guildId = interaction.options.getString('guild_id', true);
            const config = db.get(`ia_config_${guildId}`);
            if (!config) return interaction.editReply(`ℹ️ Nenhuma config personalizada para \`${guildId}\`. Usando padrões.`);

            const lines = [
                `⚙️ Config de IA — \`${guildId}\`:`,
                `• Habilitada: ${config.enabled !== false ? 'Sim' : 'Não'}`,
                `• Modo DM: ${config.dmMode ? 'Sim' : 'Não'}`,
                `• Janela de horário: ${config.horaInicio !== undefined ? `${config.horaInicio}h – ${config.horaFim}h` : 'Sem restrição'}`,
            ].join('\n');

            return interaction.editReply(lines);
        }
    },
};
