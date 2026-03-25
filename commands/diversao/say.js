const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const { formatResponse } = require('../../utils/persona');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('say')
        .setDescription('A minha voz em suas palavras.')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageMessages)
        .addStringOption(option => option.setName('mensagem').setDescription('O que deve ecoar.').setRequired(true)),
    aliases: ['falar', 'echo'],
    detailedDescription: 'Utilize o meu corpo materializado para dizer aquilo que falta nas suas cordas vocais.',
    usage: '`/say [mensagem]` e `-say [mensagem]`',
    permissions: ['Gerenciar Mensagens'], // requer permissões para não permitir flood absurdo por usuários normais
    
    async execute(interaction) {
        if (!interaction.inGuild() || !interaction.channel || !interaction.channel.isTextBased()) {
            return interaction.reply({ content: formatResponse('Esse comando só pode ser usado em um canal de texto do servidor.'), flags: ['Ephemeral'] });
        }

        if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageMessages)) {
            return interaction.reply({ content: formatResponse('Quem pede isso que pague o fardo de limpar suas próprias merdas. Você não pode.'), flags: ['Ephemeral'] });
        }

        const text = interaction.options.getString('mensagem');
        await interaction.reply({ content: 'Ok', flags: ['Ephemeral'] }).then(() => interaction.deleteReply());
        await interaction.channel.send(formatResponse(text));
    },

    async executePrefix(message, args) {
        if (!message.member.permissions.has('ManageMessages')) return message.reply(formatResponse('Quem pede isso que pague o fardo de ter as piores consequências de se colocar as palavras de outro a limpo. Cancelado.'));
        const text = args.join(' ');
        if(!text) return message.reply(formatResponse('Não tem nada aqui.'));
        
        await message.delete().catch(()=>null);
        await message.channel.send(formatResponse(text));
    }
};
