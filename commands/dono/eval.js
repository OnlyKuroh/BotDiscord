const { SlashCommandBuilder } = require('discord.js');
const { inspect } = require('node:util');
const db = require('../../utils/db');
const { requireOwner } = require('../../utils/owner');
const { formatResponse } = require('../../utils/persona');

const MAX_OUTPUT_LENGTH = 1900;

function escapeOutput(text) {
    return String(text || '')
        .replace(/`/g, '`' + String.fromCharCode(8203))
        .replace(/@/g, '@' + String.fromCharCode(8203));
}

function maskSecrets(text, client) {
    let output = String(text || '');
    const secrets = new Set();

    for (const [key, value] of Object.entries(process.env)) {
        if (!value || String(value).length < 6) continue;
        if (/token|secret|key|pass|auth/i.test(key)) {
            secrets.add(String(value));
        }
    }

    if (client?.token) secrets.add(String(client.token));

    for (const secret of secrets) {
        output = output.split(secret).join('[REDACTED]');
    }

    return output;
}

function formatValue(value) {
    if (typeof value === 'string') return value;
    return inspect(value, {
        depth: 2,
        maxArrayLength: 25,
        maxStringLength: 4000,
        breakLength: 100,
    });
}

function buildConsoleCapture(logs) {
    const push = (level, values) => {
        const rendered = values.map(value => formatValue(value)).join(' ');
        logs.push(`[${level}] ${rendered}`);
    };

    return {
        log: (...values) => push('log', values),
        info: (...values) => push('info', values),
        warn: (...values) => push('warn', values),
        error: (...values) => push('error', values),
        dir: (...values) => push('dir', values),
    };
}

function isRecoverableSyntaxError(error) {
    return error instanceof SyntaxError;
}

async function runEval(code, context) {
    const keys = Object.keys(context);
    const values = Object.values(context);

    try {
        const expressionRunner = new Function(...keys, `return (async () => (${code}\n))();`);
        return await expressionRunner(...values);
    } catch (error) {
        if (!isRecoverableSyntaxError(error)) {
            throw error;
        }
    }

    const statementRunner = new Function(...keys, `return (async () => {\n${code}\n})();`);
    return await statementRunner(...values);
}

function buildResponse(result, logs, client) {
    const sections = [];

    if (logs.length) {
        sections.push(`// console\n${logs.join('\n')}`);
    }

    sections.push(`// retorno\n${result === undefined ? 'Executado sem retorno.' : formatValue(result)}`);

    let content = sections.join('\n\n');
    content = escapeOutput(maskSecrets(content, client));

    if (content.length > MAX_OUTPUT_LENGTH) {
        content = `${content.slice(0, MAX_OUTPUT_LENGTH - 20)}\n... saída truncada`;
    }

    return `\`\`\`js\n${content}\n\`\`\``;
}

async function executeEval({ code, client, interaction, message, args }) {
    const logs = [];
    const context = {
        client,
        interaction: interaction || null,
        message: message || null,
        args: args || [],
        db,
        require,
        process,
        Buffer,
        console: buildConsoleCapture(logs),
        setTimeout,
        setInterval,
        clearTimeout,
        clearInterval,
    };

    const startedAt = Date.now();
    const result = await runEval(code, context);
    const response = buildResponse(result, logs, client);
    const elapsed = Date.now() - startedAt;

    return `${response}\nTempo: \`${elapsed}ms\``;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('eval')
        .setDescription('[DONO] Executa JavaScript no processo do bot.')
        .addStringOption(option =>
            option
                .setName('codigo')
                .setDescription('Código JavaScript para executar.')
                .setRequired(true)
        ),
    aliases: ['ev'],
    category: 'dono',
    detailedDescription: 'Esse comando existe para manutencao real do bot em tempo de guerra. Com ele voce roda JavaScript direto no processo vivo, inspeciona cache, testa funcoes, corrige rota de debug e entende na hora o que esta pegando sem precisar criar comando temporario para tudo.',
    usage: '`/eval codigo:<javascript>` ou `-eval <javascript>`',
    permissions: ['Dono do bot'],
    helpTrigger: '/eval + codigo',

    async execute(interaction, client) {
        if (await requireOwner(interaction)) return;

        const code = interaction.options.getString('codigo', true).trim();
        if (!code) {
            return interaction.reply({
                content: formatResponse('Manda um código válido para eu executar.'),
                flags: ['Ephemeral'],
            });
        }

        await interaction.deferReply({ flags: ['Ephemeral'] });

        try {
            const response = await executeEval({ code, client, interaction });
            await interaction.editReply({ content: response });
        } catch (error) {
            const output = buildResponse(error, [], client);
            await interaction.editReply({ content: output });
        }
    },

    async executePrefix(message, args, client) {
        if (await requireOwner(message)) return;

        const code = args.join(' ').trim();
        if (!code) {
            return message.reply(formatResponse('Use `-eval <codigo>` com algo para executar.'));
        }

        try {
            const response = await executeEval({ code, client, message, args });
            await message.reply(response);
        } catch (error) {
            const output = buildResponse(error, [], client);
            await message.reply(output);
        }
    },
};
