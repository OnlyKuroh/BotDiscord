const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    MessageFlags,
    EmbedBuilder,
} = require('discord.js');
const db = require('../../utils/db');

const TRIGGER_TYPES = ['prefix', 'contains', 'exact'];
const TRIGGER_LABELS = { prefix: 'Prefixo', contains: 'Contém', exact: 'Exato' };

module.exports = {
    data: new SlashCommandBuilder()
        .setName('customcmd')
        .setDescription('Gerencia comandos personalizados deste servidor.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(sub =>
            sub.setName('criar')
                .setDescription('Cria ou atualiza um comando personalizado.')
                .addStringOption(o => o.setName('gatilho').setDescription('Palavra que ativa o comando (ex: !regras)').setRequired(true))
                .addStringOption(o => o.setName('resposta').setDescription('Texto que o bot vai responder').setRequired(true))
                .addStringOption(o =>
                    o.setName('tipo')
                        .setDescription('Como o gatilho é detectado (padrão: prefix)')
                        .addChoices(
                            { name: 'Prefixo — ativa se a msg começa com o gatilho', value: 'prefix' },
                            { name: 'Contém — ativa se a msg contém o gatilho', value: 'contains' },
                            { name: 'Exato — ativa só se a msg for exatamente o gatilho', value: 'exact' },
                        )
                        .setRequired(false)
                )
                .addRoleOption(o => o.setName('cargo_necessario').setDescription('Cargo necessário para usar (opcional)').setRequired(false))
                .addIntegerOption(o => o.setName('cooldown').setDescription('Cooldown em segundos (padrão: 0)').setMinValue(0).setMaxValue(3600).setRequired(false))
        )
        .addSubcommand(sub =>
            sub.setName('deletar')
                .setDescription('Remove um comando personalizado.')
                .addStringOption(o => o.setName('gatilho').setDescription('Gatilho do comando a remover').setRequired(true))
                .addStringOption(o =>
                    o.setName('tipo')
                        .setDescription('Tipo do gatilho (padrão: prefix)')
                        .addChoices(
                            { name: 'Prefixo', value: 'prefix' },
                            { name: 'Contém', value: 'contains' },
                            { name: 'Exato', value: 'exact' },
                        )
                        .setRequired(false)
                )
        )
        .addSubcommand(sub =>
            sub.setName('listar')
                .setDescription('Lista todos os comandos personalizados do servidor.')
        )
        .addSubcommand(sub =>
            sub.setName('toggle')
                .setDescription('Ativa ou desativa um comando personalizado.')
                // Ordem correta: obrigatórios antes dos opcionais
                .addStringOption(o => o.setName('gatilho').setDescription('Gatilho do comando').setRequired(true))
                .addBooleanOption(o => o.setName('ativo').setDescription('true = ativar, false = desativar').setRequired(true))
                .addStringOption(o =>
                    o.setName('tipo')
                        .setDescription('Tipo do gatilho (padrão: prefix)')
                        .addChoices(
                            { name: 'Prefixo', value: 'prefix' },
                            { name: 'Contém', value: 'contains' },
                            { name: 'Exato', value: 'exact' },
                        )
                        .setRequired(false)
                )
        ),
    aliases: ['cc', 'cmd-custom'],
    detailedDescription: 'Cria, edita, lista e remove comandos de texto personalizados para este servidor. Suporta gatilhos por prefixo, conteúdo ou texto exato, com cooldown e restrição de cargo.',
    usage: '`/customcmd <criar|deletar|listar|toggle>`',
    permissions: ['Gerenciar Servidor'],

    async execute(interaction, client) {
        const sub = interaction.options.getSubcommand();
        const guildId = interaction.guild.id;

        if (sub === 'criar') {
            const gatilho = interaction.options.getString('gatilho', true).trim().toLowerCase();
            const resposta = interaction.options.getString('resposta', true);
            const tipo = interaction.options.getString('tipo') || 'prefix';
            const cargo = interaction.options.getRole('cargo_necessario') || null;
            const cooldown = interaction.options.getInteger('cooldown') || 0;

            if (gatilho.length > 64) {
                return interaction.reply({ content: '❌ O gatilho não pode ter mais de 64 caracteres.', flags: ['Ephemeral'] });
            }
            if (resposta.length > 1800) {
                return interaction.reply({ content: '❌ A resposta não pode ter mais de 1800 caracteres.', flags: ['Ephemeral'] });
            }

            const existing = db.getCustomCommands(guildId);
            if (existing.length >= 50 && !db.getCustomCommand(guildId, gatilho, tipo)) {
                return interaction.reply({ content: '❌ Limite de 50 comandos personalizados por servidor atingido.', flags: ['Ephemeral'] });
            }

            db.setCustomCommand({
                guildId,
                trigger: gatilho,
                triggerType: tipo,
                response: resposta,
                responseType: 'text',
                requiredRoleId: cargo?.id || null,
                cooldownSeconds: cooldown,
                createdBy: interaction.user.id,
            });

            db.addLog('CUSTOM_CMD_CREATE', `Cmd personalizado criado: "${gatilho}" (${tipo})`, guildId, interaction.user.id, interaction.user.username);

            return interaction.reply({
                content: [
                    `✅ Comando personalizado criado!`,
                    `**Gatilho:** \`${gatilho}\`  **Tipo:** ${TRIGGER_LABELS[tipo]}`,
                    `**Cargo necessário:** ${cargo ? `<@&${cargo.id}>` : 'Nenhum'}`,
                    `**Cooldown:** ${cooldown}s`,
                    `\nTeste enviando: \`${gatilho}\` no chat.`,
                ].join('\n'),
                flags: ['Ephemeral'],
            });
        }

        if (sub === 'deletar') {
            const gatilho = interaction.options.getString('gatilho', true).trim().toLowerCase();
            const tipo = interaction.options.getString('tipo') || 'prefix';
            const cmd = db.getCustomCommand(guildId, gatilho, tipo);
            if (!cmd) return interaction.reply({ content: `❌ Comando \`${gatilho}\` (${tipo}) não encontrado.`, flags: ['Ephemeral'] });

            db.deleteCustomCommand(guildId, gatilho, tipo);
            db.addLog('CUSTOM_CMD_DELETE', `Cmd personalizado removido: "${gatilho}" (${tipo})`, guildId, interaction.user.id, interaction.user.username);
            return interaction.reply({ content: `🗑️ Comando \`${gatilho}\` removido.`, flags: ['Ephemeral'] });
        }

        if (sub === 'listar') {
            await interaction.deferReply({ flags: ['Ephemeral'] });
            const cmds = db.getCustomCommands(guildId);

            if (cmds.length === 0) {
                return interaction.editReply('ℹ️ Nenhum comando personalizado criado ainda. Use `/customcmd criar` para começar.');
            }

            const container = new ContainerBuilder().setAccentColor(0xC41230);
            container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
                `## 🛠️ Comandos Personalizados (${cmds.length}/50)`
            ));
            container.addSeparatorComponents(new SeparatorBuilder());

            const chunkSize = 8;
            for (let i = 0; i < cmds.length; i += chunkSize) {
                const chunk = cmds.slice(i, i + chunkSize);
                const lines = chunk.map(cmd => {
                    const status = cmd.enabled ? '🟢' : '🔴';
                    const cooldownStr = cmd.cooldown_seconds > 0 ? ` ⏱️${cmd.cooldown_seconds}s` : '';
                    const roleStr = cmd.required_role_id ? ` 🎭<@&${cmd.required_role_id}>` : '';
                    return `${status} \`${cmd.trigger}\` **(${TRIGGER_LABELS[cmd.trigger_type] || cmd.trigger_type})**${cooldownStr}${roleStr}\n  → ${String(cmd.response).slice(0, 60)}${cmd.response.length > 60 ? '...' : ''}`;
                }).join('\n\n');

                container.addTextDisplayComponents(new TextDisplayBuilder().setContent(lines));
                if (i + chunkSize < cmds.length) container.addSeparatorComponents(new SeparatorBuilder());
            }

            return interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        if (sub === 'toggle') {
            const gatilho = interaction.options.getString('gatilho', true).trim().toLowerCase();
            const tipo = interaction.options.getString('tipo') || 'prefix';
            const ativo = interaction.options.getBoolean('ativo', true);
            const cmd = db.getCustomCommand(guildId, gatilho, tipo);
            if (!cmd) return interaction.reply({ content: `❌ Comando \`${gatilho}\` (${tipo}) não encontrado.`, flags: ['Ephemeral'] });

            db.toggleCustomCommand(guildId, gatilho, tipo, ativo);
            return interaction.reply({
                content: `${ativo ? '🟢' : '🔴'} Comando \`${gatilho}\` ${ativo ? 'ativado' : 'desativado'}.`,
                flags: ['Ephemeral'],
            });
        }
    },
};
