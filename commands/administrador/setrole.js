const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const db = require('../../utils/db');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setrole')
        .setDescription('Define cargos que são atribuídos automaticamente quando um membro entra no servidor.')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageRoles)
        // Ordem reforçada: obrigatórios antes dos opcionais
        .addRoleOption(o => o.setName('cargo1').setDescription('Primeiro cargo automático.').setRequired(true))
        .addRoleOption(o => o.setName('cargo2').setDescription('Segundo cargo automático (opcional).').setRequired(false)),
    aliases: ['autorole', 'autorol'],
    detailedDescription: 'Configura cargos que serão automaticamente dados a todos os novos membros ao entrar no servidor. Ideal para cargos de "Membro" ou similares.',
    usage: '`/setrole @cargo1 [@cargo2]`',
    permissions: ['Gerenciar Cargos'],

    async execute(interaction) {
        if (!interaction.inGuild() || !interaction.guildId) {
            return interaction.reply({ content: 'Esse comando só pode ser usado dentro de um servidor.', flags: ['Ephemeral'] });
        }

        if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageRoles)) {
            return interaction.reply({ content: 'Você não tem permissão para gerenciar cargos.', flags: ['Ephemeral'] });
        }

        const role1 = interaction.options.getRole('cargo1');
        const role2 = interaction.options.getRole('cargo2');
        const roles = [role1?.id, role2?.id].filter(Boolean);

        db.set(`auto_roles_${interaction.guildId}`, roles);

        const roleNames = [role1?.name, role2?.name].filter(Boolean).map(n => `**${n}**`).join(' e ');
        await interaction.reply({
            content: `✅ Auto-roles configurados: ${roleNames}. Todo novo membro receberá ${roles.length > 1 ? 'esses cargos' : 'esse cargo'} automaticamente.`,
            flags: ['Ephemeral']
        });
    },
};
