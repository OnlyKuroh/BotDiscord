const { SlashCommandBuilder, ChannelType } = require('discord.js');
const db = require('../../utils/db');
const { formatResponse } = require('../../utils/persona');
const { requireOwner } = require('../../utils/owner');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('globallogs')
        .setDescription('[DONO] Define um canal master para receber TODOS os logs de todos os servidores simultaneamente.')
        .addChannelOption(option => 
            option.setName('canal')
                .setDescription('Canal observatório (deixe vazio para DESATIVAR)')
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(false)
        ),
    
    async execute(interaction) {
        if (await requireOwner(interaction)) return;

        const channel = interaction.options.getChannel('canal');

        if (channel) {
            db.set('global_logs_channel', channel.id);
            await interaction.reply({ 
                content: formatResponse(`**Expansão de Domínio: Observatório.**\nO canal <#${channel.id}> sangrará continuamente com os logs globais de todos os servidores. Recomendo desativar as notificações dele.`),
                flags: ['Ephemeral'] 
            });
        } else {
            db.deleteKey('global_logs_channel');
            await interaction.reply({ 
                content: formatResponse('Observatório Global DESLIGADO. Os logs voltaram a ficar retidos em seus respectivos servidores e no site.'),
                flags: ['Ephemeral'] 
            });
        }
    }
};
