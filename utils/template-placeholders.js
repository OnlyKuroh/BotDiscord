/**
 * Sistema de variáveis ${} para o Itadori Bot.
 *
 * Variáveis de texto:
 *   ${USER}       — menciona o usuário  (<@id>)
 *   ${USERNAME}   — nome do usuário sem menção
 *   ${SERVER}     — nome do servidor
 *   ${HORARIO}    — hora atual (Brasília)
 *   ${CARGO}      — menciona um cargo (configurado por contexto)
 *   ${DIVISORIA}  — linha divisória visual (── etc.)
 *
 * Variáveis de imagem:
 *   ${USER.PERFIL} — URL do avatar do usuário
 *   ${USER.BANNER} — URL do banner do usuário
 *   ${IMG1}..${IMG5} — imagens extras do container (passadas por contexto)
 *
 * Legado (ainda aceito para compatibilidade):
 *   @USER, #Server, #Horario, {user}, {server}, {hora}
 */

const { DateTime } = (() => {
    try { return require('luxon'); } catch { return {}; }
})();

function getBrasiliaTime() {
    try {
        if (DateTime) {
            return DateTime.now().setZone('America/Sao_Paulo').toFormat('HH:mm');
        }
    } catch { /* fallback */ }
    return new Date().toLocaleTimeString('pt-BR', {
        hour: '2-digit', minute: '2-digit',
        timeZone: 'America/Sao_Paulo',
    });
}

/**
 * @param {string} template
 * @param {object} context
 * @param {string} [context.userMention]   — <@userId>
 * @param {string} [context.userName]      — nome sem menção
 * @param {string} [context.guildName]     — nome do servidor
 * @param {string} [context.cargoMention]  — <@&roleId> ou nome
 * @param {string} [context.userAvatar]    — URL do avatar
 * @param {string} [context.userBanner]    — URL do banner
 * @param {string[]} [context.images]      — até 5 URLs extras (IMG1..IMG5)
 * @param {string} [context.channelMention] — <#channelId>
 * @param {string} [context.ownerMention]  — <@ownerId>
 */
function renderTemplatePlaceholders(template, context = {}) {
    const time = getBrasiliaTime();

    const values = {
        // Novo sistema ${}
        'USER':        context.userMention  || '',
        'USERNAME':    context.userName     || '',
        'SERVER':      context.guildName    || '',
        'HORARIO':     time,
        'CARGO':       context.cargoMention || '',
        'DIVISORIA':   '─────────────────',
        'USER.PERFIL': context.userAvatar   || '',
        'USER.BANNER': context.userBanner   || '',
        'IMG1':        context.images?.[0]  || '',
        'IMG2':        context.images?.[1]  || '',
        'IMG3':        context.images?.[2]  || '',
        'IMG4':        context.images?.[3]  || '',
        'IMG5':        context.images?.[4]  || '',
        // Legado para compatibilidade total
        'CHANNEL':     context.channelMention || '',
        'GUILD_NAME':  context.guildName    || '',
        'OWNER':       context.ownerMention || '',
        'OWNER_NAME':  context.ownerName    || '',
        'USER_NAME':   context.userName     || '',
    };

    let result = String(template || '');

    // Novo sistema: ${VAR} e ${VAR.SUB}
    result = result.replace(/\$\{([A-Z0-9._]+)\}/gi, (_, key) => {
        const upper = key.toUpperCase();
        return values[upper] != null ? String(values[upper]) : '';
    });

    // Processar \n literal como quebra de linha compacta (já enviado ao Discord como \n normal)
    result = result.replace(/\\n/g, '\n');

    // Legado: @USER, #Server, #Horario, {user}, {server}, {hora}
    result = result
        .replace(/@USER/gi,     context.userMention  || context.userName || '')
        .replace(/\{user\}/gi,  context.userName     || '')
        .replace(/#Server/gi,   context.guildName    || '')
        .replace(/\{server\}/gi,context.guildName    || '')
        .replace(/#Horario/gi,  time)
        .replace(/\{hora\}/gi,  time)
        .replace(/#User/gi,     context.userName     || '')
        .replace(/#Channel/gi,  context.channelMention || '');

    return result;
}

module.exports = {
    renderTemplatePlaceholders,
    getBrasiliaTime,
};
