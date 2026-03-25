require('dotenv').config();
const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { callAI } = require('./utils/ollama-client');
const { getItadoriUpdatePersonaPrompt } = require('./utils/ai-personas');

const commands = [];
const commandsPath = path.join(__dirname, 'commands');

function collectSlashCommands() {
    const commandFolders = fs.readdirSync(commandsPath);

    for (const folder of commandFolders) {
        const folderPath = path.join(commandsPath, folder);
        if (!fs.lstatSync(folderPath).isDirectory()) continue;

        const commandFiles = fs.readdirSync(folderPath).filter((file) => file.endsWith('.js'));
        for (const file of commandFiles) {
            const filePath = path.join(folderPath, file);
            const command = require(filePath);
            if ('data' in command) {
                commands.push(command.data.toJSON());
            } else {
                console.log(`[AVISO] Falta a lamina "data" em ${filePath}.`);
            }
        }
    }
}

function runGit(args, options = {}) {
    const result = execFileSync('git', args, {
        cwd: __dirname,
        encoding: 'utf8',
        stdio: options.stdio || ['ignore', 'pipe', 'pipe'],
    });

    return typeof result === 'string' ? result.trim() : '';
}

function hasLocalChanges() {
    return Boolean(runGit(['status', '--porcelain']));
}

function getCurrentBranch() {
    return runGit(['rev-parse', '--abbrev-ref', 'HEAD']);
}

function getPrimaryRemote() {
    const remotes = runGit(['remote']).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    return remotes.includes('origin') ? 'origin' : remotes[0] || null;
}

async function generateCommitMessage(files, stats) {
    const fallback = buildFallbackCommitMessage(files);

    try {
        const response = await callAI([
            {
                role: 'system',
                content: [
                    'Voce cria mensagens de commit curtas e objetivas.',
                    getItadoriUpdatePersonaPrompt(),
                    'Responda com uma unica linha.',
                    'A mensagem deve ter ate 72 caracteres.',
                    'Use formato tipo conventional commit quando fizer sentido, como feat:, fix:, refactor:, chore:.',
                    'Nao use aspas, emojis ou markdown.',
                ].join(' '),
            },
            {
                role: 'user',
                content: JSON.stringify({
                    goal: 'Gerar mensagem de commit para deploy automatico',
                    changedFiles: files.slice(0, 20),
                    diffStat: stats,
                }),
            },
        ], {
            maxTokens: 80,
            temperature: 0.3,
        });

        const firstLine = String(response || '').split(/\r?\n/)[0].trim();
        const sanitized = firstLine.replace(/^["'`]+|["'`]+$/g, '').replace(/\s+/g, ' ').trim();
        if (sanitized && sanitized.length <= 72) {
            return sanitized;
        }
    } catch (error) {
        console.warn('[DEPLOY] Falha ao gerar mensagem de commit com IA, usando fallback:', error.message);
    }

    return fallback;
}

function buildFallbackCommitMessage(files) {
    const lowered = files.map((file) => file.toLowerCase());

    if (lowered.some((file) => file.startsWith('commands/'))) {
        return 'feat: atualiza comandos e fluxo de deploy';
    }
    if (lowered.some((file) => file.startsWith('events/'))) {
        return 'fix: ajusta eventos e monitoramento';
    }
    if (lowered.some((file) => file.startsWith('utils/'))) {
        return 'refactor: organiza utilitarios e automacoes';
    }

    return 'chore: sincroniza alteracoes antes do deploy';
}

async function prepareGitRelease() {
    if (!hasLocalChanges()) {
        console.log('[DEPLOY] Sem mudancas locais no git. Vou so sincronizar os slash commands.');
        return { committed: false, branch: getCurrentBranch(), remote: getPrimaryRemote() };
    }

    console.log('[DEPLOY] Mudancas locais detectadas. Preparando commit automatico...');
    runGit(['add', '-A']);

    const stagedFiles = runGit(['diff', '--cached', '--name-only'])
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

    if (stagedFiles.length === 0) {
        return { committed: false, branch: getCurrentBranch(), remote: getPrimaryRemote() };
    }

    const diffStat = runGit(['diff', '--cached', '--stat']);
    const branch = getCurrentBranch();
    const remote = getPrimaryRemote();
    const commitMessage = await generateCommitMessage(stagedFiles, diffStat);

    console.log(`[DEPLOY] Commit automatico gerado: ${commitMessage}`);
    runGit(['commit', '-m', commitMessage], { stdio: 'inherit' });

    return {
        committed: true,
        branch,
        remote,
        commitMessage,
        stagedFiles,
    };
}

function pushGitRelease(plan) {
    if (!plan?.committed) return;
    if (!plan.remote) {
        console.warn('[DEPLOY] Nenhum remote configurado no git. Commit local criado, mas push foi pulado.');
        return;
    }

    console.log(`[DEPLOY] Enviando commit para ${plan.remote}/${plan.branch}...`);
    runGit(['push', plan.remote, plan.branch], { stdio: 'inherit' });
}

async function deploySlashCommands() {
    const rest = new REST().setToken(process.env.DISCORD_TOKEN);

    console.log(`Puxando ${commands.length} comandos para a realidade... A Engrenagem comecou a girar.`);

    const data = await rest.put(
        Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
        { body: commands },
    );

    console.log(`Perfeito. ${data.length} comandos cravados na base de dados do servidor.`);
}

(async () => {
    try {
        collectSlashCommands();
        const gitPlan = await prepareGitRelease();
        await deploySlashCommands();
        pushGitRelease(gitPlan);
    } catch (error) {
        console.error('[DEPLOY] Falha no deploy automatico:', error);
        process.exitCode = 1;
    }
})();
