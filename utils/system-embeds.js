const { EmbedBuilder } = require('discord.js');

const LOG_EVENT_META = {
    COMMAND: { icon: '⚔️', color: '#3498db', label: 'Comando Executado' },
    EMBED_WEBHOOK: { icon: '🧩', color: '#8e44ad', label: 'Embed Enviado' },
    MEMBER_JOIN: { icon: '🟢', color: '#2ecc71', label: 'Membro Entrou' },
    MEMBER_LEAVE: { icon: '🚪', color: '#f39c12', label: 'Membro Saiu' },
    ROLE_CREATE: { icon: '🛡️', color: '#9b59b6', label: 'Cargo Criado' },
    ROLE_DELETE: { icon: '🗑️', color: '#c0392b', label: 'Cargo Apagado' },
    CHANNEL_CREATE: { icon: '🧱', color: '#27ae60', label: 'Canal Criado' },
    CHANNEL_DELETE: { icon: '🔥', color: '#c0392b', label: 'Canal Apagado' },
    GUILD_JOIN: { icon: '🌍', color: '#5865f2', label: 'Novo Servidor' },
    GUILD_RISK: { icon: '🛰️', color: '#ff7675', label: 'Risco de Servidor' },
    BAN: { icon: '🔨', color: '#e74c3c', label: 'Banimento' },
    KICK: { icon: '👢', color: '#e67e22', label: 'Expulsao' },
    MSG_DELETE: { icon: '🧹', color: '#c0392b', label: 'Mensagem Apagada' },
    MESSAGE_EDIT: { icon: '✏️', color: '#f1c40f', label: 'Mensagem Editada' },
    COMMAND_ERROR: { icon: '💥', color: '#ff4757', label: 'Erro de Comando' },
    COMMAND_SPAM: { icon: '🚨', color: '#ff4757', label: 'Abuso de Comandos' },
    SECURITY_ALERT: { icon: '🛡️', color: '#ff6b6b', label: 'Alerta de Seguranca' },
    BOT_DM_INBOUND: { icon: '📥', color: '#74b9ff', label: 'DM Recebida' },
    BOT_DM_OUTBOUND: { icon: '📤', color: '#55efc4', label: 'DM Enviada' },
    AI_INTERACTION: { icon: '🧠', color: '#00cec9', label: 'Interacao de IA' },
    AI_ERROR: { icon: '⚠️', color: '#fdcb6e', label: 'Erro da IA' },
    SYSTEM_ERROR: { icon: '☠️', color: '#2d3436', label: 'Erro do Sistema' },
    CUSTOM_CMD_TRIGGER: { icon: '🪄', color: '#a29bfe', label: 'Comando Customizado' },
    MENTION: { icon: '📣', color: '#81ecec', label: 'Mencao ao Bot' },
    MEMBER_NICKNAME: { icon: '🎭', color: '#f1c40f', label: 'Apelido Alterado' },
    MEMBER_ROLE: { icon: '🎖️', color: '#2ecc71', label: 'Cargo Alterado' },
    MEMBER_TIMEOUT: { icon: '🔇', color: '#e67e22', label: 'Timeout Aplicado' },
    MEMBER_UNTIMEOUT: { icon: '🔊', color: '#2ecc71', label: 'Timeout Removido' },
    VOICE_JOIN: { icon: '🎙️', color: '#16a085', label: 'Entrou na Call' },
    VOICE_LEAVE: { icon: '🔇', color: '#7f8c8d', label: 'Saiu da Call' },
    VOICE_MOVE: { icon: '🔀', color: '#2980b9', label: 'Mudou de Call' },
    VOICE_SERVER_MUTE: { icon: '🤐', color: '#e67e22', label: 'Mute de Voz' },
    VOICE_SERVER_UNMUTE: { icon: '🗣️', color: '#2ecc71', label: 'Unmute de Voz' },
    VOICE_SERVER_DEAF: { icon: '🎧', color: '#c0392b', label: 'Deafen Aplicado' },
    VOICE_SERVER_UNDEAF: { icon: '🎶', color: '#2ecc71', label: 'Deafen Removido' },
    UPDATES_AI: { icon: '🧠', color: '#2ecc71', label: 'Atualizacao IA' },
    UPDATES_SETUP: { icon: '📡', color: '#1abc9c', label: 'Canal de Novidades' },
    DEFAULT: { icon: '📌', color: '#c41230', label: 'Evento Rastreado' },
};

function buildAuthor(name, iconURL) {
    return iconURL ? { name, iconURL } : { name };
}

function buildFooter(text, iconURL) {
    return iconURL ? { text, iconURL } : { text };
}

function normalizeText(value, fallback = 'Nao informado.') {
    const text = String(value ?? '').trim();
    return text || fallback;
}

function truncate(value, max = 1024, fallback = 'Nao informado.') {
    const text = normalizeText(value, fallback);
    return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function formatDiscordTimestamp(date, style = 'F') {
    const resolved = new Date(date || Date.now());
    return Number.isNaN(resolved.getTime())
        ? 'Desconhecido'
        : `<t:${Math.floor(resolved.getTime() / 1000)}:${style}>`;
}

function mapFields(fields = []) {
    return fields
        .filter((field) => field && field.name && field.value)
        .slice(0, 25)
        .map((field) => ({
            name: truncate(field.name, 256, 'Detalhe'),
            value: truncate(field.value, 1024, 'Sem detalhes.'),
            inline: Boolean(field.inline),
        }));
}

function getLogMeta(type) {
    return LOG_EVENT_META[type] || LOG_EVENT_META.DEFAULT;
}

function buildDiscordFallbackBanner(label = 'Discord') {
    const safeLabel = String(label || 'Discord').replace(/[<>&"]/g, '');
    const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="420" viewBox="0 0 1200 420">
            <defs>
                <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="#0f172a" />
                    <stop offset="55%" stop-color="#1e293b" />
                    <stop offset="100%" stop-color="#5865F2" />
                </linearGradient>
            </defs>
            <rect width="1200" height="420" fill="url(#bg)" rx="28" ry="28" />
            <circle cx="170" cy="120" r="110" fill="rgba(255,255,255,0.08)" />
            <circle cx="1020" cy="320" r="150" fill="rgba(255,255,255,0.08)" />
            <rect x="66" y="74" width="400" height="34" rx="17" fill="rgba(255,255,255,0.14)" />
            <rect x="66" y="132" width="310" height="18" rx="9" fill="rgba(255,255,255,0.18)" />
            <rect x="66" y="164" width="520" height="18" rx="9" fill="rgba(255,255,255,0.10)" />
            <text x="66" y="250" fill="#ffffff" font-size="46" font-weight="700" font-family="Segoe UI, Arial, sans-serif">Novo servidor conectado</text>
            <text x="66" y="302" fill="#dbeafe" font-size="28" font-family="Segoe UI, Arial, sans-serif">${safeLabel}</text>
            <text x="66" y="344" fill="#bfdbfe" font-size="22" font-family="Segoe UI, Arial, sans-serif">Fallback visual no estilo Discord para embeds de novidades</text>
        </svg>
    `;

    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function buildBaseDetailedEmbed({
    type,
    color,
    authorName,
    authorIconUrl,
    title,
    titleUrl,
    description,
    thumbnailUrl,
    imageUrl,
    fields = [],
    footerText,
    footerIconUrl,
    timestamp = new Date(),
}) {
    const meta = getLogMeta(type);
    const embed = new EmbedBuilder()
        .setColor(color || meta.color)

        // ─── Header / Identidade do embed ────────────────────────────────────
        .setAuthor(buildAuthor(authorName || `${meta.icon} ${meta.label}`, authorIconUrl || null))

        // ─── Titulo principal ────────────────────────────────────────────────
        .setTitle(truncate(title || meta.label, 256, meta.label))
        .setURL(titleUrl || null)

        // ─── Descricao principal ─────────────────────────────────────────────
        .setDescription(truncate(description, 4096, 'Sem descricao para exibir.'))

        // ─── Thumbnail / Icone do embed ──────────────────────────────────────
        .setThumbnail(thumbnailUrl || null)

        // ─── Image / Banner ou visual principal ──────────────────────────────
        // .setImage(user) // Aqui e onde voce pluga a imagem grande do embed
        .setImage(imageUrl || null)

        // ─── Footer / Metadados finais ───────────────────────────────────────
        .setFooter(buildFooter(footerText || `Evento: ${type || 'DEFAULT'}`, footerIconUrl || null))

        // ─── Timestamp / Momento do evento ───────────────────────────────────
        .setTimestamp(timestamp || new Date());

    const mappedFields = mapFields(fields);
    if (mappedFields.length) {
        embed.addFields(mappedFields);
    }

    return embed;
}

function buildGlobalLogEmbed({
    type,
    content,
    guildName,
    guildId,
    userName,
    userId,
    channelId,
    guildIconUrl,
    userAvatarUrl,
    timestamp = new Date(),
}) {
    const meta = getLogMeta(type);
    const description = [
        '**Resumo do evento**',
        truncate(content, 1200, 'Sem conteudo adicional para exibir.'),
        '',
        '**Contexto rapido**',
        `• Servidor: **${normalizeText(guildName, 'Global')}**`,
        `• Usuario: **${normalizeText(userName, 'Sistema')}**`,
        `• Tipo: **${meta.label}**`,
    ].join('\n');

    const footerBits = [
        `Tipo: ${type || 'DEFAULT'}`,
        `Guild ID: ${guildId || 'Global'}`,
        `User ID: ${userId || 'N/A'}`,
    ];

    if (channelId) {
        footerBits.push(`Canal: ${channelId}`);
    }

    return buildBaseDetailedEmbed({
        type,
        authorName: `${meta.icon} Global Logs`,
        authorIconUrl: guildIconUrl || userAvatarUrl || null,
        title: `[${type || 'DEFAULT'}] ${meta.label}`,
        description,
        thumbnailUrl: userAvatarUrl || guildIconUrl || null,
        fields: [
            { name: 'Servidor', value: `${normalizeText(guildName, 'Global')}\n\`${guildId || 'Global'}\``, inline: true },
            { name: 'Usuario', value: `${normalizeText(userName, 'Sistema')}\n\`${userId || 'N/A'}\``, inline: true },
            { name: 'Detectado em', value: formatDiscordTimestamp(timestamp), inline: true },
        ],
        footerText: footerBits.join(' • '),
        footerIconUrl: guildIconUrl || userAvatarUrl || null,
        timestamp,
    });
}

function buildGuildArrivalEmbed({
    title,
    titleUrl,
    summary,
    guildName,
    guildId,
    ownerId,
    memberCount,
    preferredLocale,
    verificationLevel,
    features = [],
    createdAt,
    joinedAt,
    iconUrl,
    imageUrl,
    detectedAfterRestart = false,
}) {
    const featureSummary = Array.isArray(features) && features.length
        ? features.slice(0, 6).map((feature) => `\`${feature}\``).join(', ')
        : 'Sem features especiais expostas pela API no momento.';

    const description = [
        detectedAfterRestart
            ? '**Reconexao detectada apos o bot voltar ao ar**'
            : '**Entrada detectada em tempo real**',
        '',
        truncate(summary, 2000, 'O bot coletou os dados basicos da guild, mas a leitura detalhada ainda nao ficou disponivel.'),
        '',
        '**Panorama capturado**',
        `• **Membros:** ${memberCount || 0}`,
        `• **Idioma principal:** ${preferredLocale || 'desconhecido'}`,
        `• **Nivel de verificacao:** ${verificationLevel || 'desconhecido'}`,
        `• **Adicionado em:** ${formatDiscordTimestamp(joinedAt)}`,
    ].join('\n');

    return buildBaseDetailedEmbed({
        type: 'GUILD_JOIN',
        color: '#5865f2',
        authorName: detectedAfterRestart ? '🌍 Central de Novidades • Entrada Reconhecida' : '🌍 Central de Novidades • Novo Servidor',
        authorIconUrl: iconUrl || null,
        title: title || guildName || 'Novo Servidor',
        titleUrl: titleUrl || iconUrl || null,
        description,
        thumbnailUrl: iconUrl || null,
        imageUrl: imageUrl || buildDiscordFallbackBanner(guildName || 'Discord Server'),
        fields: [
            { name: '👥 Membros', value: `\`${memberCount || 0}\``, inline: true },
            { name: '🌐 Idioma', value: `\`${preferredLocale || 'desconhecido'}\``, inline: true },
            { name: '🛡️ Verificacao', value: `\`${verificationLevel || 'desconhecido'}\``, inline: true },
            { name: '📌 Guild ID', value: `\`${guildId || 'desconhecido'}\``, inline: true },
            { name: '👑 Dono', value: ownerId ? `<@${ownerId}>` : 'Desconhecido', inline: true },
            { name: '🧩 Features', value: featureSummary, inline: false },
            { name: '📆 Criado em', value: formatDiscordTimestamp(createdAt), inline: true },
            { name: '⚡ Entrou no bot em', value: formatDiscordTimestamp(joinedAt), inline: true },
        ],
        footerText: detectedAfterRestart
            ? 'Entrada detectada em reconciliacao apos restart'
            : 'Entrada enviada automaticamente pelo fluxo de novidades',
        footerIconUrl: iconUrl || null,
        timestamp: joinedAt || new Date(),
    });
}

function buildCuteDogNewsEmbed({ requestedBy = 'Sistema de Testes' }) {
    return buildBaseDetailedEmbed({
        type: 'UPDATES_AI',
        color: '#f5b041',
        authorName: '📰 Noticias • Modo de Teste',
        title: 'Cachorro fofo interrompe o caos e domina a timeline',
        description: [
            '**Resumo da pauta**',
            'Uma noticia fake puxou um cachorro fofo como destaque visual para validar layout, imagem principal e bloco de resumo no canal de novidades.',
            '',
            '**O que esta sendo testado**',
            '• destaque visual com `setImage`',
            '• thumbnail para tema da pauta',
            '• footer com contexto de disparo',
        ].join('\n'),
        thumbnailUrl: 'https://placedog.net/300/300?id=24',
        imageUrl: 'https://placedog.net/900/420?id=24',
        fields: [
            { name: 'Fonte', value: 'Feed fake de noticias animais', inline: true },
            { name: 'Tema', value: 'Animais / cachorro fofo', inline: true },
            { name: 'Solicitado por', value: requestedBy, inline: true },
        ],
        footerText: `Teste visual solicitado por ${requestedBy}`,
        timestamp: new Date(),
    });
}

function buildMemberJoinLogEmbed(member) {
    const avatarUrl = member.user.displayAvatarURL({ dynamic: true, size: 512 });

    return buildBaseDetailedEmbed({
        type: 'MEMBER_JOIN',
        authorName: '🟢 Logs do Servidor • Membro Entrou',
        authorIconUrl: avatarUrl,
        title: 'Nova entrada detectada',
        description: [
            '**Movimento registrado**',
            `<@${member.user.id}> acabou de entrar em **${member.guild.name}** e ja foi rastreado pelo observatorio de logs.`,
            '',
            '**Leitura rapida**',
            `• Usuario: **${member.user.tag}**`,
            `• Conta criada em: ${formatDiscordTimestamp(member.user.createdAt)}`,
            `• Entrada no servidor: ${formatDiscordTimestamp(member.joinedAt || new Date())}`,
        ].join('\n'),
        thumbnailUrl: avatarUrl,
        fields: [
            { name: 'Usuario', value: `${member.user.tag}\n\`${member.user.id}\``, inline: true },
            { name: 'Entrou em', value: formatDiscordTimestamp(member.joinedAt || new Date()), inline: true },
            { name: 'Conta criada', value: formatDiscordTimestamp(member.user.createdAt), inline: true },
        ],
        footerText: `Guild: ${member.guild.name} • User ID: ${member.user.id}`,
        footerIconUrl: avatarUrl,
        timestamp: new Date(),
    });
}

function buildMemberLeaveLogEmbed(member) {
    const avatarUrl = member.user.displayAvatarURL({ dynamic: true, size: 512 });

    return buildBaseDetailedEmbed({
        type: 'MEMBER_LEAVE',
        authorName: '🚪 Logs do Servidor • Membro Saiu',
        authorIconUrl: avatarUrl,
        title: 'Saida registrada',
        description: [
            '**Movimento registrado**',
            `<@${member.user.id}> nao esta mais em **${member.guild.name}**.`,
            '',
            '**Leitura rapida**',
            `• Usuario: **${member.user.tag}**`,
            `• Esteve no servidor desde: ${formatDiscordTimestamp(member.joinedAt || member.user.createdAt)}`,
            `• Evento detectado em: ${formatDiscordTimestamp(new Date())}`,
        ].join('\n'),
        thumbnailUrl: avatarUrl,
        fields: [
            { name: 'Usuario', value: `${member.user.tag}\n\`${member.user.id}\``, inline: true },
            { name: 'Entrou em', value: formatDiscordTimestamp(member.joinedAt || member.user.createdAt), inline: true },
            { name: 'Saiu em', value: formatDiscordTimestamp(new Date()), inline: true },
        ],
        footerText: `Guild: ${member.guild.name} • User ID: ${member.user.id}`,
        footerIconUrl: avatarUrl,
        timestamp: new Date(),
    });
}

function buildRoleCreateLogEmbed(role) {
    const guildIcon = role.guild.iconURL({ dynamic: true, size: 512 });

    return buildBaseDetailedEmbed({
        type: 'ROLE_CREATE',
        authorName: '🛡️ Logs do Servidor • Cargo Criado',
        authorIconUrl: guildIcon,
        title: 'Novo cargo criado',
        description: [
            '**Movimento registrado**',
            `O cargo <@&${role.id}> foi criado em **${role.guild.name}**.`,
            '',
            '**Leitura rapida**',
            `• Nome: **${role.name}**`,
            `• Cor: \`${role.hexColor}\``,
            `• Posicao: \`${role.position}\``,
        ].join('\n'),
        thumbnailUrl: guildIcon,
        fields: [
            { name: 'Cargo', value: `${role.name}\n\`${role.id}\``, inline: true },
            { name: 'Cor', value: `\`${role.hexColor}\``, inline: true },
            { name: 'Posicao', value: `\`${role.position}\``, inline: true },
        ],
        footerText: `Guild: ${role.guild.name} • Role ID: ${role.id}`,
        footerIconUrl: guildIcon,
        timestamp: new Date(),
    });
}

function buildRoleDeleteLogEmbed(role) {
    const guildIcon = role.guild.iconURL({ dynamic: true, size: 512 });

    return buildBaseDetailedEmbed({
        type: 'ROLE_DELETE',
        authorName: '🗑️ Logs do Servidor • Cargo Apagado',
        authorIconUrl: guildIcon,
        title: 'Cargo removido',
        description: [
            '**Movimento registrado**',
            `O cargo **${role.name}** foi apagado de **${role.guild.name}**.`,
            '',
            '**Leitura rapida**',
            `• Role ID: \`${role.id}\``,
            `• Ultima cor conhecida: \`${role.hexColor}\``,
            `• Ultima posicao conhecida: \`${role.position}\``,
        ].join('\n'),
        thumbnailUrl: guildIcon,
        fields: [
            { name: 'Cargo removido', value: `${role.name}\n\`${role.id}\``, inline: true },
            { name: 'Cor', value: `\`${role.hexColor}\``, inline: true },
            { name: 'Posicao', value: `\`${role.position}\``, inline: true },
        ],
        footerText: `Guild: ${role.guild.name} • Role ID: ${role.id}`,
        footerIconUrl: guildIcon,
        timestamp: new Date(),
    });
}

function buildChannelCreateLogEmbed(channel) {
    const guildIcon = channel.guild.iconURL({ dynamic: true, size: 512 });

    return buildBaseDetailedEmbed({
        type: 'CHANNEL_CREATE',
        authorName: '🧱 Logs do Servidor • Canal Criado',
        authorIconUrl: guildIcon,
        title: 'Novo canal criado',
        description: [
            '**Movimento registrado**',
            `Um novo canal foi criado em **${channel.guild.name}**: <#${channel.id}>.`,
            '',
            '**Leitura rapida**',
            `• Nome: **${channel.name}**`,
            `• Tipo: \`${channel.type}\``,
            `• Categoria: ${channel.parent ? `**${channel.parent.name}**` : 'Sem categoria'}`,
        ].join('\n'),
        thumbnailUrl: guildIcon,
        fields: [
            { name: 'Canal', value: `${channel.name}\n\`${channel.id}\``, inline: true },
            { name: 'Tipo', value: `\`${channel.type}\``, inline: true },
            { name: 'Categoria', value: channel.parent ? `${channel.parent.name}\n\`${channel.parentId}\`` : 'Sem categoria', inline: true },
        ],
        footerText: `Guild: ${channel.guild.name} • Channel ID: ${channel.id}`,
        footerIconUrl: guildIcon,
        timestamp: new Date(),
    });
}

function buildChannelDeleteLogEmbed(channel) {
    const guildIcon = channel.guild.iconURL({ dynamic: true, size: 512 });

    return buildBaseDetailedEmbed({
        type: 'CHANNEL_DELETE',
        authorName: '🔥 Logs do Servidor • Canal Apagado',
        authorIconUrl: guildIcon,
        title: 'Canal removido',
        description: [
            '**Movimento registrado**',
            `O canal **${channel.name}** foi apagado de **${channel.guild.name}**.`,
            '',
            '**Leitura rapida**',
            `• Channel ID: \`${channel.id}\``,
            `• Tipo: \`${channel.type}\``,
            `• Categoria anterior: ${channel.parent ? `**${channel.parent.name}**` : 'Sem categoria'}`,
        ].join('\n'),
        thumbnailUrl: guildIcon,
        fields: [
            { name: 'Canal removido', value: `${channel.name}\n\`${channel.id}\``, inline: true },
            { name: 'Tipo', value: `\`${channel.type}\``, inline: true },
            { name: 'Categoria anterior', value: channel.parent ? `${channel.parent.name}\n\`${channel.parentId}\`` : 'Sem categoria', inline: true },
        ],
        footerText: `Guild: ${channel.guild.name} • Channel ID: ${channel.id}`,
        footerIconUrl: guildIcon,
        timestamp: new Date(),
    });
}

function buildBanLogEmbed(ban) {
    const avatarUrl = ban.user.displayAvatarURL({ dynamic: true, size: 512 });

    return buildBaseDetailedEmbed({
        type: 'BAN',
        authorName: '🔨 Logs do Servidor • Banimento',
        authorIconUrl: avatarUrl,
        title: 'Banimento registrado',
        description: [
            '**Movimento registrado**',
            `<@${ban.user.id}> foi banido de **${ban.guild.name}**.`,
            '',
            '**Motivo**',
            truncate(ban.reason || 'Nenhum motivo informado no evento de banimento.', 1000),
        ].join('\n'),
        thumbnailUrl: avatarUrl,
        fields: [
            { name: 'Usuario', value: `${ban.user.tag}\n\`${ban.user.id}\``, inline: true },
            { name: 'Servidor', value: `${ban.guild.name}\n\`${ban.guild.id}\``, inline: true },
            { name: 'Detectado em', value: formatDiscordTimestamp(new Date()), inline: true },
        ],
        footerText: `Guild: ${ban.guild.name} • User ID: ${ban.user.id}`,
        footerIconUrl: avatarUrl,
        timestamp: new Date(),
    });
}

function buildCommandLogEmbed(interaction) {
    const avatarUrl = interaction.user.displayAvatarURL({ dynamic: true, size: 512 });
    const options = flattenInteractionOptions(interaction.options?.data || []);
    const optionsText = options.length
        ? options.map((option) => `• \`${option.name}\`: ${truncate(renderOptionValue(option.value), 80)}`).join('\n')
        : 'Nenhuma opcao relevante foi enviada neste comando.';

    return buildBaseDetailedEmbed({
        type: 'COMMAND',
        authorName: '⚔️ Logs do Servidor • Comando Executado',
        authorIconUrl: avatarUrl,
        title: `/${interaction.commandName} executado`,
        description: [
            '**Movimento registrado**',
            `<@${interaction.user.id}> executou \`/${interaction.commandName}\` em <#${interaction.channelId}>.`,
            '',
            '**Parametros lidos**',
            optionsText,
        ].join('\n'),
        thumbnailUrl: avatarUrl,
        fields: [
            { name: 'Usuario', value: `${interaction.user.tag}\n\`${interaction.user.id}\``, inline: true },
            { name: 'Canal', value: `<#${interaction.channelId}>\n\`${interaction.channelId}\``, inline: true },
            { name: 'Comando', value: `\`/${interaction.commandName}\``, inline: true },
        ],
        footerText: `Guild: ${interaction.guild?.name || 'DM'} • User ID: ${interaction.user.id}`,
        footerIconUrl: avatarUrl,
        timestamp: new Date(),
    });
}

function buildMessageDeleteLogEmbed(message) {
    const avatarUrl = message.author.displayAvatarURL({ dynamic: true, size: 512 });
    const attachmentCount = message.attachments?.size || 0;

    return buildBaseDetailedEmbed({
        type: 'MSG_DELETE',
        authorName: '🧹 Logs do Servidor • Mensagem Apagada',
        authorIconUrl: avatarUrl,
        title: 'Mensagem removida',
        description: [
            '**Movimento registrado**',
            `<@${message.author.id}> teve uma mensagem apagada em <#${message.channel.id}>.`,
            '',
            '**Conteudo capturado**',
            truncate(message.content || 'Mensagem sem texto. Talvez so anexos.', 1600),
        ].join('\n'),
        thumbnailUrl: avatarUrl,
        fields: [
            { name: 'Autor', value: `${message.author.tag}\n\`${message.author.id}\``, inline: true },
            { name: 'Canal', value: `<#${message.channel.id}>\n\`${message.channel.id}\``, inline: true },
            { name: 'Anexos', value: `\`${attachmentCount}\``, inline: true },
        ],
        footerText: `Guild: ${message.guild.name} • Message ID: ${message.id}`,
        footerIconUrl: avatarUrl,
        timestamp: new Date(),
    });
}

function buildMessageEditLogEmbed(oldMessage, newMessage) {
    const avatarUrl = oldMessage.author.displayAvatarURL({ dynamic: true, size: 512 });

    return buildBaseDetailedEmbed({
        type: 'MESSAGE_EDIT',
        authorName: '✏️ Logs do Servidor • Mensagem Editada',
        authorIconUrl: avatarUrl,
        title: 'Mensagem editada',
        description: [
            '**Movimento registrado**',
            `<@${oldMessage.author.id}> editou uma mensagem em <#${oldMessage.channel.id}>.`,
            `[Abrir mensagem editada](${newMessage.url})`,
        ].join('\n'),
        thumbnailUrl: avatarUrl,
        fields: [
            {
                name: 'Antes',
                value: `\`\`\`text\n${truncate(oldMessage.content || 'vazio', 980, 'vazio')}\n\`\`\``,
                inline: false,
            },
            {
                name: 'Depois',
                value: `\`\`\`text\n${truncate(newMessage.content || 'vazio', 980, 'vazio')}\n\`\`\``,
                inline: false,
            },
        ],
        footerText: `Guild: ${oldMessage.guild.name} • Message ID: ${oldMessage.id}`,
        footerIconUrl: avatarUrl,
        timestamp: new Date(),
    });
}

function buildNicknameUpdateLogEmbed(oldMember, newMember) {
    const avatarUrl = newMember.user.displayAvatarURL({ dynamic: true, size: 512 });

    return buildBaseDetailedEmbed({
        type: 'MEMBER_NICKNAME',
        authorName: '🎭 Logs do Servidor • Apelido Alterado',
        authorIconUrl: avatarUrl,
        title: 'Apelido alterado',
        description: [
            '**Movimento registrado**',
            `<@${newMember.user.id}> alterou a identidade local em **${newMember.guild.name}**.`,
            '',
            '**Leitura rapida**',
            `• Antes: ${oldMember.nickname || 'Nome original da conta'}`,
            `• Agora: ${newMember.nickname || 'Voltou para o nome original da conta'}`,
        ].join('\n'),
        thumbnailUrl: avatarUrl,
        fields: [
            { name: 'Usuario', value: `${newMember.user.tag}\n\`${newMember.user.id}\``, inline: true },
            { name: 'Apelido antigo', value: oldMember.nickname || 'Nome original da conta', inline: true },
            { name: 'Apelido novo', value: newMember.nickname || 'Nome original da conta', inline: true },
        ],
        footerText: `Guild: ${newMember.guild.name} • User ID: ${newMember.user.id}`,
        footerIconUrl: avatarUrl,
        timestamp: new Date(),
    });
}

function buildRoleUpdateLogEmbed(newMember, roleId, action = 'added') {
    const avatarUrl = newMember.user.displayAvatarURL({ dynamic: true, size: 512 });
    const isAdd = action === 'added';

    return buildBaseDetailedEmbed({
        type: 'MEMBER_ROLE',
        color: isAdd ? '#2ecc71' : '#e74c3c',
        authorName: isAdd ? '🎖️ Logs do Servidor • Cargo Concedido' : '🗑️ Logs do Servidor • Cargo Removido',
        authorIconUrl: avatarUrl,
        title: isAdd ? 'Cargo adicionado ao membro' : 'Cargo removido do membro',
        description: [
            '**Movimento registrado**',
            isAdd
                ? `<@${newMember.user.id}> recebeu o cargo <@&${roleId}>.`
                : `<@${newMember.user.id}> perdeu o cargo <@&${roleId}>.`,
            '',
            '**Leitura rapida**',
            `• Usuario: **${newMember.user.tag}**`,
            `• Acao: **${isAdd ? 'adicao' : 'remocao'}**`,
            `• Cargo: <@&${roleId}>`,
        ].join('\n'),
        thumbnailUrl: avatarUrl,
        fields: [
            { name: 'Usuario', value: `${newMember.user.tag}\n\`${newMember.user.id}\``, inline: true },
            { name: 'Cargo', value: `<@&${roleId}>\n\`${roleId}\``, inline: true },
            { name: 'Acao', value: isAdd ? 'Adicionado' : 'Removido', inline: true },
        ],
        footerText: `Guild: ${newMember.guild.name} • User ID: ${newMember.user.id}`,
        footerIconUrl: avatarUrl,
        timestamp: new Date(),
    });
}

function buildTimeoutLogEmbed(newMember, action = 'applied') {
    const avatarUrl = newMember.user.displayAvatarURL({ dynamic: true, size: 512 });
    const isApplied = action === 'applied';
    const until = newMember.communicationDisabledUntilTimestamp
        ? formatDiscordTimestamp(newMember.communicationDisabledUntilTimestamp)
        : 'Sem prazo informado.';

    return buildBaseDetailedEmbed({
        type: isApplied ? 'MEMBER_TIMEOUT' : 'MEMBER_UNTIMEOUT',
        color: isApplied ? '#e67e22' : '#2ecc71',
        authorName: isApplied ? '🔇 Logs do Servidor • Timeout Aplicado' : '🔊 Logs do Servidor • Timeout Removido',
        authorIconUrl: avatarUrl,
        title: isApplied ? 'Timeout registrado' : 'Timeout removido',
        description: [
            '**Movimento registrado**',
            isApplied
                ? `<@${newMember.user.id}> recebeu timeout em **${newMember.guild.name}**.`
                : `<@${newMember.user.id}> voltou a falar em **${newMember.guild.name}**.`,
            '',
            '**Leitura rapida**',
            isApplied ? `• Termina em: ${until}` : '• Comunicacao restaurada no servidor.',
        ].join('\n'),
        thumbnailUrl: avatarUrl,
        fields: [
            { name: 'Usuario', value: `${newMember.user.tag}\n\`${newMember.user.id}\``, inline: true },
            { name: 'Acao', value: isApplied ? 'Timeout aplicado' : 'Timeout removido', inline: true },
            { name: 'Prazo', value: isApplied ? until : 'Restaurado agora', inline: true },
        ],
        footerText: `Guild: ${newMember.guild.name} • User ID: ${newMember.user.id}`,
        footerIconUrl: avatarUrl,
        timestamp: new Date(),
    });
}

function buildVoiceLogEmbed({ kind, member, oldChannelId, newChannelId }) {
    const avatarUrl = member.user.displayAvatarURL({ dynamic: true, size: 512 });
    const metaTypeMap = {
        join: 'VOICE_JOIN',
        leave: 'VOICE_LEAVE',
        move: 'VOICE_MOVE',
        serverMute: 'VOICE_SERVER_MUTE',
        serverUnmute: 'VOICE_SERVER_UNMUTE',
        serverDeaf: 'VOICE_SERVER_DEAF',
        serverUndeaf: 'VOICE_SERVER_UNDEAF',
    };
    const type = metaTypeMap[kind] || 'DEFAULT';

    let title = 'Evento de voz detectado';
    let description = '**Movimento registrado**';
    let fields = [
        { name: 'Usuario', value: `${member.user.tag}\n\`${member.user.id}\``, inline: true },
        { name: 'Servidor', value: `${member.guild.name}\n\`${member.guild.id}\``, inline: true },
        { name: 'Detectado em', value: formatDiscordTimestamp(new Date()), inline: true },
    ];

    if (kind === 'join') {
        title = 'Entrada em call';
        description = [
            '**Movimento registrado**',
            `<@${member.user.id}> entrou em <#${newChannelId}>.`,
            '',
            '**Leitura rapida**',
            `• Canal atual: <#${newChannelId}>`,
        ].join('\n');
        fields[1] = { name: 'Canal atual', value: `<#${newChannelId}>\n\`${newChannelId}\``, inline: true };
    } else if (kind === 'leave') {
        title = 'Saida de call';
        description = [
            '**Movimento registrado**',
            `<@${member.user.id}> saiu de <#${oldChannelId}>.`,
            '',
            '**Leitura rapida**',
            `• Canal anterior: <#${oldChannelId}>`,
        ].join('\n');
        fields[1] = { name: 'Canal anterior', value: `<#${oldChannelId}>\n\`${oldChannelId}\``, inline: true };
    } else if (kind === 'move') {
        title = 'Mudanca de call';
        description = [
            '**Movimento registrado**',
            `<@${member.user.id}> trocou de call.`,
            '',
            '**Leitura rapida**',
            `• Saiu de: <#${oldChannelId}>`,
            `• Entrou em: <#${newChannelId}>`,
        ].join('\n');
        fields = [
            { name: 'Usuario', value: `${member.user.tag}\n\`${member.user.id}\``, inline: true },
            { name: 'Canal antigo', value: `<#${oldChannelId}>\n\`${oldChannelId}\``, inline: true },
            { name: 'Canal novo', value: `<#${newChannelId}>\n\`${newChannelId}\``, inline: true },
        ];
    } else if (kind === 'serverMute') {
        title = 'Servidor silenciou o membro';
        description = `**Movimento registrado**\n<@${member.user.id}> foi silenciado pelo servidor na call atual.`;
    } else if (kind === 'serverUnmute') {
        title = 'Servidor removeu o mute';
        description = `**Movimento registrado**\n<@${member.user.id}> voltou a falar na call atual.`;
    } else if (kind === 'serverDeaf') {
        title = 'Servidor aplicou deafen';
        description = `**Movimento registrado**\n<@${member.user.id}> foi ensurdecido pelo servidor na call atual.`;
    } else if (kind === 'serverUndeaf') {
        title = 'Servidor removeu deafen';
        description = `**Movimento registrado**\n<@${member.user.id}> teve a audicao restaurada na call atual.`;
    }

    return buildBaseDetailedEmbed({
        type,
        authorName: `${getLogMeta(type).icon} Logs do Servidor • ${getLogMeta(type).label}`,
        authorIconUrl: avatarUrl,
        title,
        description,
        thumbnailUrl: avatarUrl,
        fields,
        footerText: `Guild: ${member.guild.name} • User ID: ${member.user.id}`,
        footerIconUrl: avatarUrl,
        timestamp: new Date(),
    });
}

function buildTestLogEmbed({
    eventType,
    guildName = 'Kuroh Community',
    guildId = '000000000000000000',
    userName = 'Membro Fake',
    userId = '111111111111111111',
    channelId = '222222222222222222',
    thumbnailUrl,
}) {
    const meta = getLogMeta(eventType);
    const fakeDescriptions = {
        MEMBER_JOIN: 'Um membro fake atravessou o portal de entrada e o sistema registrou a chegada com avatar, horarios e contexto completo.',
        ROLE_DELETE: 'O cargo "Guardiao Fantasma" foi apagado num teste controlado para revisar layout, footer e blocos de leitura.',
        BAN: 'Um webhook de laboratorio foi banido durante o teste de moderacao para validar o embed de punicao.',
        MSG_DELETE: 'Uma mensagem de teste foi apagada para validar captura de conteudo, canal e rodape tecnico.',
        CHANNEL_CREATE: 'Um canal fake nasceu para testar como o layout destaca categoria, tipo e identificadores.',
        CHANNEL_DELETE: 'Um canal fake foi removido para testar o estado de exclusao com descricao e contexto visual.',
        MESSAGE_EDIT: 'Uma mensagem fake foi reescrita para validar blocos Antes/Depois com bastante separacao.',
        VOICE_JOIN: 'Um usuario fake entrou numa call para testar evento de voz com miniatura mais chamativa.',
    };

    return buildBaseDetailedEmbed({
        type: eventType,
        authorName: `${meta.icon} Preview de Logs • ${meta.label}`,
        authorIconUrl: thumbnailUrl || 'https://cdn.discordapp.com/embed/avatars/0.png',
        title: `[TESTE] ${meta.label}`,
        description: [
            '**Preview forcado via /test**',
            fakeDescriptions[eventType] || 'Evento fake enviado para revisar o layout do embed.',
            '',
            '**Contexto fake**',
            `• Guild: **${guildName}**`,
            `• Usuario: **${userName}**`,
            `• Canal: <#${channelId}>`,
        ].join('\n'),
        thumbnailUrl: thumbnailUrl || 'https://media.tenor.com/W4dF4I0FvTAAAAAC/dog-smile.gif',
        fields: [
            { name: 'Servidor', value: `${guildName}\n\`${guildId}\``, inline: true },
            { name: 'Usuario fake', value: `${userName}\n\`${userId}\``, inline: true },
            { name: 'Canal fake', value: `<#${channelId}>\n\`${channelId}\``, inline: true },
        ],
        footerText: `Teste visual • Evento: ${eventType}`,
        footerIconUrl: thumbnailUrl || 'https://cdn.discordapp.com/embed/avatars/0.png',
        timestamp: new Date(),
    });
}

function flattenInteractionOptions(options = []) {
    const output = [];

    for (const option of options) {
        if (option?.options?.length) {
            output.push(...flattenInteractionOptions(option.options));
            continue;
        }

        output.push({
            name: option.name,
            value: option.value,
        });
    }

    return output;
}

function renderOptionValue(value) {
    if (value === null || value === undefined) return 'null';
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    return String(value);
}

module.exports = {
    LOG_EVENT_META,
    buildGlobalLogEmbed,
    buildGuildArrivalEmbed,
    buildCuteDogNewsEmbed,
    buildMemberJoinLogEmbed,
    buildMemberLeaveLogEmbed,
    buildRoleCreateLogEmbed,
    buildRoleDeleteLogEmbed,
    buildChannelCreateLogEmbed,
    buildChannelDeleteLogEmbed,
    buildBanLogEmbed,
    buildCommandLogEmbed,
    buildMessageDeleteLogEmbed,
    buildMessageEditLogEmbed,
    buildNicknameUpdateLogEmbed,
    buildRoleUpdateLogEmbed,
    buildTimeoutLogEmbed,
    buildVoiceLogEmbed,
    buildTestLogEmbed,
    buildDiscordFallbackBanner,
};
