const { SlashCommandBuilder, PermissionsBitField, AttachmentBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../utils/db');
const { formatResponse } = require('../../utils/persona');
const { prepareWelcomeBannerUrl } = require('../../utils/persistent-panels');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setwelcome')
        .setDescription('Define o canal e os portões de boas-vindas.')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild)
        // Ordem reforçada: obrigatórios antes dos opcionais
        .addChannelOption(option => option.setName('canal').setDescription('Onde a pessoa irá cair.').setRequired(true))
        .addStringOption(option => option.setName('mensagem').setDescription('Título | Descrição (com @USER)').setRequired(true))
        .addAttachmentOption(option => option.setName('banner').setDescription('A bandeira estendida').setRequired(false)),
    aliases: ['welcome', 'boasvindas'],
    detailedDescription: 'Cria os parâmetros pesados de recepção. O formato da mensagem divide o título e o corpo com um `|`. E você pode anexar uma imagem como banner no slash command. \nSe usar command prefix (-setwelcome), você pode anexar a imagem direto na mensagem da chamada.',
    usage: '`/setwelcome canal:[#canal] mensagem:[Título | Descrição] banner:[imagem]`',
    permissions: ['Administrador / Gerenciar Servidor'],
    
    async execute(interaction, client) {
        if (!interaction.inGuild() || !interaction.guildId) {
            return interaction.reply({ content: formatResponse('Esse comando só pode ser usado dentro de um servidor.'), flags: ['Ephemeral'] });
        }

        if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageGuild)) {
            return interaction.reply({ content: formatResponse('Você não tem peso pra configurar isso. Apenas administradores.'), flags: ['Ephemeral'] });
        }

        const channel = interaction.options.getChannel('canal');
        if (!channel || !channel.isTextBased()) {
            return interaction.reply({ content: formatResponse('Escolha um canal de texto válido para as boas-vindas.'), flags: ['Ephemeral'] });
        }

        const text = interaction.options.getString('mensagem');
        const banner = interaction.options.getAttachment('banner');
        
        const bannerUrl = banner ? await prepareWelcomeBannerUrl(banner.url, interaction.guildId) : null;
        
        db.set(`welcome_${interaction.guildId}`, {
            channelId: channel.id,
            text: text,
            bannerUrl: bannerUrl
        });
        
        await interaction.reply({ content: formatResponse('Regras cravadas no canal. Eles serão forçados a passar por lá.'), flags: ['Ephemeral'] });
    },
    
    async executePrefix(message, args, client) {
        if (!message.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            return message.reply({ content: formatResponse('Você não tem peso pra configurar isso.') });
        }
        
        const channel = message.mentions.channels.first();
        if (!channel) return message.reply(formatResponse('Sua mente falhou. Você deve marcar um canal.'));
        
        const fullMsg = args.slice(1).join(' '); // pular o canal
        if (!fullMsg) return message.reply(formatResponse('Escreva o conteúdo. Exemplo: Título | Descrição com @USER'));

        const attachment = message.attachments.first();
        const bannerUrl = attachment ? await prepareWelcomeBannerUrl(attachment.url, message.guild.id) : null;
        
        db.set(`welcome_${message.guild.id}`, {
            channelId: channel.id,
            text: fullMsg,
            bannerUrl: bannerUrl
        });

        await message.reply(formatResponse('O portão foi forjado. Serão recebidos a sangue e suor no destino alinhado.'));
    }
};
