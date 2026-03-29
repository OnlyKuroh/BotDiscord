const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { EmbedBuilder } = require('discord.js');
const db = require('../utils/db');
const { getNewsStatsSnapshot } = require('../utils/newsRoleStats');
const { buildGlobalLogEmbed } = require('../utils/system-embeds');
const http = require('http');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const {
    normalizeManagedImageUrl,
    prepareWelcomeBannerUrl,
    ensureVerificationPanel,
    ensureNewsPanel,
} = require('../utils/persistent-panels');

// ─── Auth Config ──────────────────────────────────────────────────────────────
const JWT_SECRET = process.env.SESSION_SECRET || 'itadori_secret_change_me_in_env';
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET || '';
const OAUTH_REDIRECT_URI = process.env.OAUTH_REDIRECT_URI || 'http://localhost:3001/auth/discord/callback';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3002';
const dataDir = path.join(__dirname, '..', 'data');
const uploadsDir = path.join(dataDir, 'uploads');

function requireAuth(req, res, next) {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : auth;
    if (!token) return res.status(401).json({ error: 'Não autenticado.' });
    try {
        req.user = jwt.verify(token, JWT_SECRET);
        next();
    } catch {
        res.status(401).json({ error: 'Token inválido ou expirado.' });
    }
}

function isGuildAdmin(userGuilds, guildId) {
    const g = (userGuilds || []).find(g => g.id === guildId);
    if (!g) return false;
    const p = BigInt(g.permissions || 0);
    return (p & BigInt(0x8)) !== BigInt(0) || (p & BigInt(0x20)) !== BigInt(0);
}

function requireGuildAdmin(req, res, next) {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : auth;
    if (!token) return res.status(401).json({ error: 'Não autenticado.' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const guildId = req.params.guildId || req.body?.guildId || req.query?.guildId;
        if (!guildId) return res.status(400).json({ error: 'guildId obrigatório.' });
        if (!isGuildAdmin(decoded.guilds, guildId)) {
            return res.status(403).json({ error: 'Sem permissão de administrador neste servidor.' });
        }
        req.user = decoded;
        next();
    } catch {
        res.status(401).json({ error: 'Token inválido ou expirado.' });
    }
}

// Configuração do Multer para Uploads Locais
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
        cb(null, uploadsDir);
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage: storage });

function startDashboard(client) {
    const app = express();
    const server = http.createServer(app);
    const io = new Server(server, {
        cors: { origin: "*", methods: ["GET", "POST"] }
    });
    // Expõe Socket.io para eventos externos sem dependência circular
    global._dashboardIo = io;
    const port = Number(process.env.PORT || 3001);

    // Aceita requisições do site na Vercel e de localhost em desenvolvimento
    const allowedOrigins = (process.env.DASHBOARD_ORIGIN || '')
        .split(',').map(s => s.trim()).filter(Boolean);

    app.use(cors({
        origin: (origin, cb) => {
            // Permite sem origin (curl, Postman, same-origin)
            if (!origin) return cb(null, true);
            if (allowedOrigins.length === 0) return cb(null, true); // sem restrição se não configurado
            if (allowedOrigins.includes('*') || allowedOrigins.some(o => origin.startsWith(o))) {
                return cb(null, true);
            }
            cb(new Error(`CORS bloqueado para origin: ${origin}`));
        },
        credentials: true,
    }));
    app.use(express.json());
    app.use(express.static(path.join(__dirname, '..', 'dashboard')));
    app.use('/uploads', express.static(uploadsDir));
    // Assets locais do LoL (ranks, lanes, maestrias, honras) — gerados por scripts/download-lol-assets.js
    app.use('/lol-assets', express.static(path.join(__dirname, '..', 'assets', 'lol')));

    // WebSocket: Real-time logs
    io.on('connection', (socket) => {
        console.log('[DASHBOARD] Receptor conectado ao domínio.');
    });

    // Função para emitir logs em tempo real e enviar para o canal Global
    const originalAddLog = db.addLog;
    db.addLog = function(...args) {
        originalAddLog.call(db, ...args);
        const [type, content, guild_id, user_id, user_name] = args;
        
        io.emit('newLog', {
            type, content, guild_id, user_id, user_name, timestamp: new Date()
        });

        // Envia para o canal global do Dono (se definido por /globallogs)
        const globalId = db.get('global_logs_channel');
        if (globalId) {
            void (async () => {
                const channel = client.channels.cache.get(globalId) || await client.channels.fetch(globalId).catch(() => null);
                if (channel) {
                    let guildName = 'Desconhecido';
                    let guildIconUrl = null;
                    let userAvatarUrl = null;

                    if (guild_id) {
                        const cachedGuild = client.guilds.cache.get(guild_id);
                        if (cachedGuild) {
                            guildName = cachedGuild.name;
                            guildIconUrl = cachedGuild.iconURL({ dynamic: true, size: 256 }) || null;
                        } else {
                            try {
                                const fetchedGuild = await client.guilds.fetch(guild_id);
                                guildName = fetchedGuild.name;
                                guildIconUrl = fetchedGuild.iconURL({ dynamic: true, size: 256 }) || null;
                            } catch {
                                guildName = 'Desconhecido';
                            }
                        }
                    } else {
                        guildName = 'Global';
                    }

                    if (user_id) {
                        const user = client.users.cache.get(user_id) || await client.users.fetch(user_id).catch(() => null);
                        userAvatarUrl = user?.displayAvatarURL({ dynamic: true, size: 256 }) || null;
                    }

                    const embed = buildGlobalLogEmbed({
                        type,
                        content,
                        guildName,
                        guildId: guild_id,
                        userName: user_name,
                        userId: user_id,
                        guildIconUrl,
                        userAvatarUrl,
                        timestamp: new Date(),
                    });

                    channel.send({ embeds: [embed] }).catch(() => null);
                }
            })();
        }
    };

    // API: Stats
    app.get('/api/ai-provider', (req, res) => {
        const { getProviderInfo } = require('../utils/ollama-client');
        res.json(getProviderInfo());
    });

    app.get('/api/stats', (req, res) => {
        const totalMembers = client.guilds.cache.reduce((acc, g) => acc + g.memberCount, 0);
        res.json({
            members: totalMembers,
            guilds: client.guilds.cache.size,
            ping: client.ws.ping,
            botAvatar: client.user.displayAvatarURL(),
            botName: client.user.username,
            commandsUsed: db.getStat('slash_commands_used') || 0,
            uptimeSeconds: Math.floor(process.uptime()),
        });
    });

    // API: Channels
    app.get('/api/channels', (req, res) => {
        const channels = [];
        client.guilds.cache.forEach(guild => {
            guild.channels.cache
                .filter(c => c.type === 0)
                .forEach(c => channels.push({ id: c.id, name: `${guild.name} | #${c.name}` }));
        });
        res.json(channels);
    });

    // API: Emojis
    app.get('/api/emojis', (req, res) => {
        const emojis = client.emojis.cache.map(e => ({
            id: e.id,
            name: e.name,
            animated: e.animated,
            url: e.url,
            raw: `<${e.animated ? 'a' : ''}:${e.name}:${e.id}>`
        }));
        res.json(emojis);
    });

    // API: Internal Logs
    app.get('/api/logs', (req, res) => {
        const logs = db.getLogs(50);
        res.json(logs);
    });

    app.get('/api/updates', (req, res) => {
        const limit = Math.min(Number(req.query.limit) || 6, 12);
        const updates = db.getRecentReleaseUpdates(limit);
        res.json(updates);
    });

    // API: Guilds
    app.get('/api/guilds', (req, res) => {
        const guilds = client.guilds.cache.map(g => ({
            id: g.id, name: g.name,
            icon: g.iconURL({ size: 64, extension: 'webp' }) || null,
            memberCount: g.memberCount
        }));
        res.json(guilds);
    });

    // API: Guilds List (public — detailed)
    app.get('/api/guilds-list', (req, res) => {
        const guilds = client.guilds.cache.map(g => ({
            id: g.id,
            name: g.name,
            icon: g.iconURL({ size: 128, extension: 'webp' }) || null,
            memberCount: g.memberCount,
            ownerId: g.ownerId,
            createdAt: g.createdAt,
        }));

        guilds.sort((a, b) => b.memberCount - a.memberCount);
        res.json(guilds);
    });

    // API: Welcome Config GET
    app.get('/api/welcome-config/:guildId', (req, res) => {
        const config = db.get(`welcome_${req.params.guildId}`);
        res.json(config || { channelId: null, text: '', bannerUrl: null });
    });

    // API: Welcome Config POST
    app.post('/api/welcome-config', requireGuildAdmin, async (req, res) => {
        const { guildId, channelId, text, bannerUrl } = req.body;
        if (!guildId || !channelId || !text) return res.status(400).json({ error: 'Dados incompletos.' });
        const stableBannerUrl = bannerUrl
            ? await prepareWelcomeBannerUrl(normalizeManagedImageUrl(bannerUrl), guildId).catch(() => normalizeManagedImageUrl(bannerUrl))
            : null;
        db.set(`welcome_${guildId}`, { channelId, text, bannerUrl: stableBannerUrl || null });
        res.json({ success: true });
    });

    // API: IA Config GET
    app.get('/api/ia-config/:guildId', (req, res) => {
        const config = db.get(`ia_config_${req.params.guildId}`);
        res.json(config || { enabled: true, dmMode: false, maxCallsPerHour: 25, horaInicio: 0, horaFim: 24, cooldownMinutes: 30 });
    });

    // API: IA Config POST
    app.post('/api/ia-config', requireGuildAdmin, (req, res) => {
        const { guildId, enabled, dmMode, maxCallsPerHour, horaInicio, horaFim, cooldownMinutes } = req.body;
        if (!guildId) return res.status(400).json({ error: 'ID do servidor ausente.' });
        db.set(`ia_config_${guildId}`, { 
            enabled: enabled !== undefined ? !!enabled : true,
            dmMode: !!dmMode,
            maxCallsPerHour: parseInt(maxCallsPerHour) || 25,
            horaInicio: parseInt(horaInicio) >= 0 ? parseInt(horaInicio) : 0,
            horaFim: parseInt(horaFim) >= 0 ? parseInt(horaFim) : 24,
            cooldownMinutes: parseInt(cooldownMinutes) || 30
        });
        res.json({ success: true });
    });

    // API: Members
    app.get('/api/members', (req, res) => {
        const members = [];
        client.guilds.cache.forEach(guild => {
            guild.members.cache.forEach(member => {
                if (member.user.bot) return;
                const highestRole = member.roles.cache
                    .filter(r => r.name !== '@everyone')
                    .sort((a, b) => b.position - a.position)
                    .first();
                const color = highestRole && highestRole.hexColor !== '#000000'
                    ? highestRole.hexColor
                    : '#C41230';
                members.push({
                    id: member.id,
                    name: member.displayName,
                    username: member.user.username,
                    avatar: member.user.displayAvatarURL({ size: 64, extension: 'webp' }),
                    role: highestRole ? highestRole.name : 'Membro',
                    color,
                    status: member.presence?.status || 'offline'
                });
            });
        });
        const shuffled = members.sort(() => Math.random() - 0.5).slice(0, 24);
        res.json(shuffled);
    });

    // API: Roles
    app.get('/api/roles', (req, res) => {
        const roles = [];
        client.guilds.cache.forEach(guild => {
            guild.roles.cache
                .filter(r => r.name !== '@everyone')
                .sort((a, b) => b.position - a.position)
                .forEach(r => roles.push({
                    id: r.id,
                    name: r.name,
                    color: r.hexColor !== '#000000' ? r.hexColor : '#99AAB5'
                }));
        });
        res.json(roles);
    });

    // API: Logs Config GET
    app.get('/api/logs-config/:guildId', (req, res) => {
        const channelId = db.get(`logs_${req.params.guildId}`) || null;
        const events = db.get(`logs_events_${req.params.guildId}`) || {};
        res.json({ channelId, events });
    });

    // API: Logs Config POST
    app.post('/api/logs-config', requireGuildAdmin, (req, res) => {
        const { guildId, channelId, events } = req.body;
        if (!guildId || !channelId) return res.status(400).json({ error: 'Dados incompletos.' });
        db.set(`logs_${guildId}`, channelId);
        db.set(`logs_events_${guildId}`, events || {});
        res.json({ success: true });
    });

    // API: Verify Config GET
    app.get('/api/verify-config/:guildId', (req, res) => {
        const guildId = req.params.guildId;
        const channelId = db.get(`verify_channel_${guildId}`) || null;
        const roleId = db.get(`verify_role_${guildId}`) || null;
        const roleId2 = db.get(`verify_role2_${guildId}`) || null;
        const extra = db.get(`verify_config_${guildId}`) || { message: '', keyword: 'verificar' };
        res.json({ channelId, roleId, roleId2, message: extra.message || '', keyword: extra.keyword || 'verificar' });
    });

    // API: Verify Config POST
    app.post('/api/verify-config', requireGuildAdmin, async (req, res) => {
        const { guildId, channelId, roleId, roleId2, message, keyword } = req.body;
        if (!guildId || !channelId || !roleId) return res.status(400).json({ error: 'Dados incompletos.' });

        try {
            // Salvar configuração
            db.set(`verify_channel_${guildId}`, channelId);
            db.set(`verify_role_${guildId}`, roleId);
            db.set(`verify_role2_${guildId}`, roleId2 || null);
            db.set(`verify_config_${guildId}`, { message: message || '', keyword: keyword || 'verificar' });

            await ensureVerificationPanel(client, guildId);
            db.addLog('VERIFY_SETUP', `Sistema de verificação configurado em <#${channelId}>`, guildId, null, 'Dashboard');

            res.json({ success: true });
        } catch (error) {
            console.error('[VERIFY CONFIG]', error);
            res.status(500).json({ error: 'Erro ao configurar verificação.' });
        }
    });

    // API: Command List
    app.get('/api/commands', (req, res) => {
        const categoryMap = {
            'administrador': 'Administrador',
            'utilidade': 'Utilidade',
            'diversao': 'Diversão',
        };
        const commands = client.commands.map(cmd => ({
            name: cmd.data?.name || '',
            description: cmd.data?.description || 'Sem descrição.',
            category: categoryMap[cmd.category] || (cmd.category ? cmd.category.charAt(0).toUpperCase() + cmd.category.slice(1) : 'Geral'),
            aliases: cmd.aliases || [],
            usage: cmd.usage || `/${cmd.data?.name || ''}`,
            detailedDescription: cmd.detailedDescription || '',
            permissions: cmd.permissions || [],
        }));
        res.json(commands);
    });

    // API: Guild Config GET
    app.get('/api/guild-config/:guildId', (req, res) => {
        const guildId = req.params.guildId;
        const prefix = db.get(`prefix_${guildId}`) || client.prefix || '-';
        const mentionResponse = db.get(`mention_response_${guildId}`) || '';
        const guild = client.guilds.cache.get(guildId);
        const nickname = guild?.members?.me?.nickname || '';
        res.json({ prefix, mentionResponse, nickname });
    });

    // API: Guild Config POST
    app.post('/api/guild-config', requireGuildAdmin, async (req, res) => {
        try {
            const { guildId, prefix, mentionResponse, nickname } = req.body;
            if (!guildId) return res.status(400).json({ error: 'guildId obrigatório.' });
            if (prefix !== undefined) db.set(`prefix_${guildId}`, prefix);
            if (mentionResponse !== undefined) db.set(`mention_response_${guildId}`, mentionResponse);
            if (nickname !== undefined) {
                const guild = client.guilds.cache.get(guildId);
                if (guild?.members?.me) await guild.members.me.setNickname(nickname || null).catch(() => null);
            }
            res.json({ success: true });
        } catch (err) {
            console.error('[guild-config POST]', err);
            res.status(500).json({ error: 'Erro interno ao salvar configuração.' });
        }
    });

    // API: Auto-Roles GET
    app.get('/api/auto-roles/:guildId', (req, res) => {
        const roles = db.get(`auto_roles_${req.params.guildId}`) || [];
        res.json({ roles });
    });

    // API: Auto-Roles POST
    app.post('/api/auto-roles', requireGuildAdmin, (req, res) => {
        const { guildId, roles } = req.body;
        if (!guildId) return res.status(400).json({ error: 'guildId obrigatório.' });
        db.set(`auto_roles_${guildId}`, Array.isArray(roles) ? roles : []);
        res.json({ success: true });
    });

    // API: Channel Filter GET
    app.get('/api/channel-filter/:guildId', (req, res) => {
        const config = db.get(`channel_filter_${req.params.guildId}`) || { mode: 'off', channels: [] };
        res.json(config);
    });

    // API: Channel Filter POST
    app.post('/api/channel-filter', requireGuildAdmin, (req, res) => {
        const { guildId, mode, channels } = req.body;
        if (!guildId) return res.status(400).json({ error: 'guildId obrigatório.' });
        db.set(`channel_filter_${guildId}`, {
            mode: ['off', 'allow', 'deny'].includes(mode) ? mode : 'off',
            channels: Array.isArray(channels) ? channels : [],
        });
        res.json({ success: true });
    });

    // API: Fetch Discord Logs (Deep Search)
    app.get('/api/discord-logs/:channelId', async (req, res) => {
        try {
            const channel = await client.channels.fetch(req.params.channelId);
            if (!channel) return res.status(404).json({ error: 'Canal não encontrado.' });
            
            const messages = await channel.messages.fetch({ limit: 20 });
            const logs = messages.map(m => ({
                id: m.id,
                author: m.author.username,
                content: m.content,
                embeds: m.embeds,
                timestamp: m.createdAt
            }));
            res.json(logs);
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    // API: Upload Image
    app.post('/api/upload', upload.single('file'), (req, res) => {
        if (!req.file) return res.status(400).json({ error: 'Nenhuma imagem enviada.' });
        const fileUrl = normalizeManagedImageUrl(`/uploads/${req.file.filename}`);
        res.json({ url: fileUrl });
    });

    // API: Send Embed (Via Webhook)
    app.post('/api/send-embed', async (req, res) => {
        const { channelId, title, description, color, image, thumbnail, footer, username, avatar, fields } = req.body;

        try {
            const channel = await client.channels.fetch(channelId);
            if (!channel) return res.status(404).json({ success: false, error: 'Canal não encontrado.' });

            let webhook = (await channel.fetchWebhooks()).find(w => w.name === 'Portão do Domínio');
            if (!webhook) {
                webhook = await channel.createWebhook({
                    name: 'Portão do Domínio',
                    avatar: client.user.displayAvatarURL(),
                });
            }

            const webhookOpts = {
                username: username || 'Yuji Itadori',
                avatarURL: avatar || client.user.displayAvatarURL(),
            };

            // Fields bundled (separate: false) go into the main embed
            const bundledFields = Array.isArray(fields) ? fields.filter(f => !f.separate) : [];
            const separateFields = Array.isArray(fields) ? fields.filter(f => f.separate) : [];

            const mainEmbed = new EmbedBuilder()
                .setColor(color || '#8b0000')
                .setTitle(title || null)
                .setDescription(description || null)
                .setFooter(footer ? { text: footer } : null);

            const filesToAttach = [];
            const processImage = (url, isThumbnail = false) => {
                if (!url) return;
                if (url.includes('/uploads/')) {
                    const filename = url.split('/').pop().split('?')[0];
                    const filePath = path.join(uploadsDir, filename);
                    if (fs.existsSync(filePath)) {
                        filesToAttach.push({ attachment: filePath, name: filename });
                        if (isThumbnail) mainEmbed.setThumbnail(`attachment://${filename}`);
                        else mainEmbed.setImage(`attachment://${filename}`);
                        return;
                    }
                }
                if (isThumbnail) mainEmbed.setThumbnail(url);
                else mainEmbed.setImage(url);
            };

            processImage(image, false);
            processImage(thumbnail, true);

            if (bundledFields.length > 0) {
                mainEmbed.addFields(bundledFields.map(f => ({
                    name: f.name || '\u200b',
                    value: f.value || '\u200b',
                    inline: !!f.inline,
                })));
            }

            await webhook.send({ ...webhookOpts, embeds: [mainEmbed], files: filesToAttach });

            // Send each "separate" field as its own embed
            for (const f of separateFields) {
                const sepEmbed = new EmbedBuilder()
                    .setColor(color || '#8b0000')
                    .setDescription(null);
                sepEmbed.addFields([{
                    name: f.name || '\u200b',
                    value: f.value || '\u200b',
                    inline: !!f.inline,
                }]);
                await webhook.send({ ...webhookOpts, embeds: [sepEmbed] });
            }

            // Incrementa contador de comandos (ação do dashboard conta)
            db.incrementStat('slash_commands_used');
            db.addLog('EMBED_WEBHOOK', `Embed enviado para <#${channelId}> via Painel Web`, channel.guild.id, null, 'Dashboard');
            res.json({ success: true });
        } catch (error) {
            console.error(error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // ─────────────────────────────────────────────────────────────────────────
    // API: Events Config GET
    // ─────────────────────────────────────────────────────────────────────────
    app.get('/api/events-config/:guildId', (req, res) => {
        const config = db.get(`events_${req.params.guildId}`) || {};
        res.json(config);
    });

    // API: Events Config POST
    app.post('/api/events-config', requireGuildAdmin, (req, res) => {
        const { guildId, eventKey, data } = req.body;
        if (!guildId || !eventKey) return res.status(400).json({ error: 'guildId e eventKey obrigatórios.' });
        const atual = db.get(`events_${guildId}`) || {};
        const atualizado = { ...atual, [eventKey]: { ...atual[eventKey], ...data } };
        db.set(`events_${guildId}`, atualizado);
        res.json({ success: true });
    });

    // API: Events Test (dispara evento agora para testar)
    app.post('/api/events-test', requireGuildAdmin, async (req, res) => {
        const { guildId, eventKey } = req.body;
        if (!guildId || !eventKey) return res.status(400).json({ error: 'guildId e eventKey obrigatórios.' });

        try {
            const scheduler = require('./events-scheduler');
            const config    = db.get(`events_${guildId}`) || {};
            const conf      = config[eventKey];

            if (!conf?.channelId) return res.status(400).json({ error: 'Canal não configurado para este evento.' });

            const handler = scheduler.handlers[eventKey];
            if (!handler) return res.status(400).json({ error: `Handler para "${eventKey}" não encontrado.` });

            await handler(client, guildId, conf);
            res.json({ success: true, message: `Evento "${eventKey}" disparado com sucesso!` });
        } catch (err) {
            console.error('[EVENTS TEST]', err);
            res.status(500).json({ error: err.message });
        }
    });

    // ─── News Panel API Routes ───────────────────────────────────────────────────

    // GET: Busca informações do painel de notícias
    app.get('/api/news-panel/:guildId', (req, res) => {
        const { guildId } = req.params;
        const channelId = db.get(`news_panel_channel_${guildId}`);
        const eventsConfig = db.get(`events_${guildId}`) || {};

        res.json({
            channelId: channelId || null,
            eventsConfig,
        });
    });

    // GET: Estatísticas de inscritos por categoria
    app.get('/api/news-stats/:guildId', async (req, res) => {
        const { guildId } = req.params;
        const guild = client.guilds.cache.get(guildId);

        if (!guild) {
            return res.json({ stats: {} });
        }

        try {
            const stats = getNewsStatsSnapshot(guild);
            res.json({ stats });
        } catch (err) {
            console.error('[NEWS STATS]', err);
            res.json({ stats: {} });
        }
    });

    // POST: Criar/Recriar painel de notícias
    app.post('/api/news-panel/create', requireGuildAdmin, async (req, res) => {
        const { guildId, channelId, customTitle, customDesc, customColor } = req.body;

        if (!guildId || !channelId) {
            return res.status(400).json({ error: 'guildId e channelId são obrigatórios.' });
        }

        try {
            const guild = client.guilds.cache.get(guildId);
            if (!guild) return res.status(404).json({ error: 'Servidor não encontrado.' });

            const channel = guild.channels.cache.get(channelId);
            if (!channel) return res.status(404).json({ error: 'Canal não encontrado.' });

            const eventsConfig = db.get(`events_${guildId}`) || {};

            const NEWS_REACTIONS = [
                { key: 'anime',        emoji: '🎌', label: 'Anime' },
                { key: 'noticias',     emoji: '📰', label: 'Notícias' },
                { key: 'politica_br',  emoji: '🏛️', label: 'Política BR' },
                { key: 'politica_mun', emoji: '🌍', label: 'Política Mundial' },
                { key: 'ia_news',      emoji: '🤖', label: 'IA News' },
                { key: 'financeiro',   emoji: '💹', label: 'Financeiro' },
                { key: 'cotacao',      emoji: '💱', label: 'Cotações' },
                { key: 'google_news',  emoji: '🔍', label: 'Google News' },
                { key: 'horoscopo',    emoji: '♈', label: 'Horóscopo' },
                { key: 'steam',        emoji: '🎮', label: 'Steam' },
                { key: 'esports_lol',  emoji: '🏆', label: 'E-sports LoL' },
                { key: 'eleicao',      emoji: '🗳️', label: 'Eleições' },
            ];

            // Filtra apenas eventos habilitados com cargo
            const activeReactions = NEWS_REACTIONS.filter(btn => {
                const conf = eventsConfig[btn.key];
                return conf?.enabled && conf?.roleId;
            });

            if (activeReactions.length === 0) {
                return res.status(400).json({ error: 'Nenhuma categoria está habilitada com cargo configurado.' });
            }

            db.set(`news_panel_config_${guildId}`, {
                customTitle: customTitle || null,
                customDesc: customDesc || null,
                customColor: customColor || null,
            });
            db.set(`news_panel_channel_${guildId}`, channelId);
            await ensureNewsPanel(client, guildId);

            res.json({ success: true, message: 'Painel criado com sucesso!' });
        } catch (err) {
            console.error('[NEWS PANEL CREATE]', err);
            res.status(500).json({ error: err.message });
        }
    });

    // POST: Remover painel de notícias
    app.post('/api/news-panel/remove', requireGuildAdmin, (req, res) => {
        const { guildId } = req.body;

        if (!guildId) {
            return res.status(400).json({ error: 'guildId é obrigatório.' });
        }

        try {
            db.delete(`news_panel_channel_${guildId}`);
            db.delete(`news_panel_message_${guildId}`);
            db.delete(`news_panel_config_${guildId}`);

            res.json({ success: true, message: 'Painel removido!' });
        } catch (err) {
            console.error('[NEWS PANEL REMOVE]', err);
            res.status(500).json({ error: err.message });
        }
    });

    // ─── Custom Commands API ─────────────────────────────────────────────────────

    // GET: Lista comandos personalizados de um servidor
    app.get('/api/custom-commands/:guildId', requireGuildAdmin, (req, res) => {
        const cmds = db.getCustomCommands(req.params.guildId);
        res.json(cmds);
    });

    // POST: Cria ou atualiza um comando personalizado
    app.post('/api/custom-commands', requireGuildAdmin, (req, res) => {
        const { guildId, trigger, triggerType, response, requiredRoleId, cooldownSeconds } = req.body;
        if (!guildId || !trigger || !response) {
            return res.status(400).json({ error: 'guildId, trigger e response são obrigatórios.' });
        }
        if (trigger.length > 64) return res.status(400).json({ error: 'Gatilho muito longo (máx 64 chars).' });
        if (response.length > 1800) return res.status(400).json({ error: 'Resposta muito longa (máx 1800 chars).' });

        const existing = db.getCustomCommands(guildId);
        if (existing.length >= 50 && !db.getCustomCommand(guildId, trigger.toLowerCase(), triggerType || 'prefix')) {
            return res.status(400).json({ error: 'Limite de 50 comandos personalizados atingido.' });
        }

        db.setCustomCommand({
            guildId,
            trigger: trigger.toLowerCase().trim(),
            triggerType: triggerType || 'prefix',
            response,
            responseType: 'text',
            requiredRoleId: requiredRoleId || null,
            cooldownSeconds: cooldownSeconds || 0,
            createdBy: req.user?.id || null,
        });

        db.addLog('CUSTOM_CMD_CREATE', `Cmd personalizado criado via dashboard: "${trigger}" (${triggerType || 'prefix'})`, guildId, req.user?.id, req.user?.username);
        res.json({ success: true });
    });

    // DELETE: Remove um comando personalizado
    app.delete('/api/custom-commands/:guildId/:trigger/:triggerType', requireGuildAdmin, (req, res) => {
        const { guildId, trigger, triggerType } = req.params;
        db.deleteCustomCommand(guildId, decodeURIComponent(trigger), decodeURIComponent(triggerType));
        res.json({ success: true });
    });

    // PATCH: Ativa/desativa um comando personalizado
    app.patch('/api/custom-commands/:guildId/:trigger/:triggerType/toggle', requireGuildAdmin, (req, res) => {
        const { guildId, trigger, triggerType } = req.params;
        const { enabled } = req.body;
        db.toggleCustomCommand(guildId, decodeURIComponent(trigger), decodeURIComponent(triggerType), enabled);
        res.json({ success: true });
    });

    // ─── IA Config API ────────────────────────────────────────────────────────────

    // GET: Configuração de IA por servidor
    app.get('/api/ia-config/:guildId', requireGuildAdmin, (req, res) => {
        const config = db.get(`ia_config_${req.params.guildId}`) || { enabled: true, dmMode: false };
        res.json(config);
    });

    // POST: Atualiza configuração de IA por servidor
    app.post('/api/ia-config', requireGuildAdmin, (req, res) => {
        const { guildId, enabled, dmMode, horaInicio, horaFim } = req.body;
        if (!guildId) return res.status(400).json({ error: 'guildId obrigatório.' });
        const current = db.get(`ia_config_${guildId}`) || {};
        db.set(`ia_config_${guildId}`, {
            ...current,
            ...(enabled !== undefined ? { enabled } : {}),
            ...(dmMode !== undefined ? { dmMode } : {}),
            ...(horaInicio !== undefined ? { horaInicio: horaInicio === null ? undefined : Number(horaInicio) } : {}),
            ...(horaFim !== undefined ? { horaFim: horaFim === null ? undefined : Number(horaFim) } : {}),
        });
        res.json({ success: true });
    });

    // GET: Logs globais de todos os servidores (para dashboard owner)
    app.get('/api/logs-all', (req, res) => {
        const limit = Math.min(parseInt(req.query.limit) || 100, 200);
        const logs = db.getLogs(limit);
        // Enriquece com nome do servidor
        const enriched = logs.map(log => {
            const guild = log.guild_id ? client.guilds.cache.get(log.guild_id) : null;
            return { ...log, guild_name: guild?.name || null };
        });
        res.json(enriched);
    });

    // ─── Discord OAuth2 ──────────────────────────────────────────────────────────
    app.get('/auth/discord', (req, res) => {
        const params = new URLSearchParams({
            client_id: process.env.CLIENT_ID,
            redirect_uri: OAUTH_REDIRECT_URI,
            response_type: 'code',
            scope: 'identify guilds',
        });
        res.redirect(`https://discord.com/api/oauth2/authorize?${params}`);
    });

    app.get('/auth/discord/callback', async (req, res) => {
        const { code } = req.query;
        if (!code) return res.redirect(`${FRONTEND_URL}/admin?error=no_code`);

        try {
            const tokenRes = await axios.post(
                'https://discord.com/api/oauth2/token',
                new URLSearchParams({
                    client_id: process.env.CLIENT_ID,
                    client_secret: DISCORD_CLIENT_SECRET,
                    grant_type: 'authorization_code',
                    code,
                    redirect_uri: OAUTH_REDIRECT_URI,
                }),
                { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
            );

            const { access_token } = tokenRes.data;

            const [userRes, guildsRes] = await Promise.all([
                axios.get('https://discord.com/api/v10/users/@me', {
                    headers: { Authorization: `Bearer ${access_token}` },
                }),
                axios.get('https://discord.com/api/v10/users/@me/guilds', {
                    headers: { Authorization: `Bearer ${access_token}` },
                }),
            ]);

            const user = userRes.data;
            const guilds = guildsRes.data;

            const jwtToken = jwt.sign(
                {
                    userId: user.id,
                    username: user.username,
                    avatar: user.avatar,
                    guilds: guilds.map(g => ({
                        id: g.id,
                        name: g.name,
                        icon: g.icon,
                        permissions: String(g.permissions),
                    })),
                },
                JWT_SECRET,
                { expiresIn: '24h' }
            );

            res.redirect(`${FRONTEND_URL}/admin?token=${jwtToken}`);
        } catch (err) {
            console.error('[AUTH CALLBACK]', err.message);
            res.redirect(`${FRONTEND_URL}/admin?error=auth_failed`);
        }
    });

    app.get('/auth/me', requireAuth, (req, res) => {
        const { userId, username, avatar } = req.user;
        res.json({ userId, username, avatar });
    });

    app.get('/auth/logout', (req, res) => {
        res.json({ ok: true });
    });

    // ─── My Guilds (user is admin + bot is present) ───────────────────────────
    app.get('/api/my-guilds', requireAuth, (req, res) => {
        const userGuilds = req.user.guilds || [];
        const result = userGuilds
            .filter(g => isGuildAdmin([g], g.id))
            .filter(g => client.guilds.cache.has(g.id))
            .map(g => {
                const botGuild = client.guilds.cache.get(g.id);
                return {
                    id: g.id,
                    name: g.name,
                    icon: g.icon
                        ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.webp?size=64`
                        : null,
                    memberCount: botGuild.memberCount,
                };
            });
        res.json(result);
    });

    // ─── Guild-scoped Channels ────────────────────────────────────────────────
    app.get('/api/guild/:guildId/channels', requireAuth, (req, res) => {
        const guild = client.guilds.cache.get(req.params.guildId);
        if (!guild) return res.status(404).json({ error: 'Servidor não encontrado.' });
        const channels = guild.channels.cache
            .filter(c => c.type === 0)
            .sort((a, b) => a.position - b.position)
            .map(c => ({ id: c.id, name: `#${c.name}` }));
        res.json([...channels.values()]);
    });

    // ─── Guild-scoped Roles ───────────────────────────────────────────────────
    app.get('/api/guild/:guildId/roles', requireAuth, (req, res) => {
        const guild = client.guilds.cache.get(req.params.guildId);
        if (!guild) return res.status(404).json({ error: 'Servidor não encontrado.' });
        const roles = guild.roles.cache
            .filter(r => r.name !== '@everyone')
            .sort((a, b) => b.position - a.position)
            .map(r => ({
                id: r.id,
                name: r.name,
                color: r.hexColor !== '#000000' ? r.hexColor : '#99AAB5',
            }));
        res.json([...roles.values()]);
    });

    // ─── Auto Role Creation ───────────────────────────────────────────────────
    app.post('/api/guild/:guildId/roles/create', requireGuildAdmin, async (req, res) => {
        const { name, color } = req.body;
        if (!name) return res.status(400).json({ error: 'Nome do cargo obrigatório.' });

        try {
            const guild = client.guilds.cache.get(req.params.guildId);
            if (!guild) return res.status(404).json({ error: 'Servidor não encontrado.' });

            const existing = guild.roles.cache.find(
                r => r.name.toLowerCase() === name.toLowerCase()
            );
            if (existing) {
                return res.json({ id: existing.id, name: existing.name, alreadyExisted: true });
            }

            const role = await guild.roles.create({
                name,
                color: color || '#99AAB5',
                reason: 'Criado automaticamente pelo painel Itadori',
            });

            db.addLog('ROLE_CREATE', `Cargo "${name}" criado via painel`, req.params.guildId, null, 'Dashboard');
            res.json({ id: role.id, name: role.name, created: true });
        } catch (err) {
            console.error('[ROLE CREATE]', err);
            res.status(500).json({ error: err.message });
        }
    });

    // ─── Guild-scoped Stats ───────────────────────────────────────────────────
    app.get('/api/guild/:guildId/stats', requireAuth, (req, res) => {
        const guild = client.guilds.cache.get(req.params.guildId);
        if (!guild) return res.status(404).json({ error: 'Servidor não encontrado.' });
        res.json({
            memberCount: guild.memberCount,
            name: guild.name,
            icon: guild.iconURL({ size: 64, extension: 'webp' }),
            ping: client.ws.ping,
            commandsUsed: db.getStat('slash_commands_used') || 0,
            uptimeSeconds: Math.floor(process.uptime()),
            botName: client.user.username,
            botAvatar: client.user.displayAvatarURL(),
        });
    });

    // ─── API: Detailed Stats (global dashboard) ─────────────────────────────
    app.get('/api/stats-detailed', (req, res) => {
        const guilds = client.guilds.cache;
        const totalMembers = guilds.reduce((a, g) => a + g.memberCount, 0);
        const topGuilds = [...guilds.values()]
            .sort((a, b) => b.memberCount - a.memberCount)
            .slice(0, 5)
            .map(g => ({ id: g.id, name: g.name, memberCount: g.memberCount, icon: g.iconURL({ size: 64, extension: 'webp' }) }));

        // Count custom commands total
        let totalCustomCmds = 0;
        try {
            const Database = require('better-sqlite3');
            const path = require('path');
            const rawDb = new Database(process.env.DB_PATH || path.join(dataDir, 'database.db'), { readonly: true });
            const row = rawDb.prepare("SELECT COUNT(*) as cnt FROM custom_commands").get();
            totalCustomCmds = row?.cnt || 0;
            rawDb.close();
        } catch { /* ignore */ }

        const blacklist = db.getBlacklist ? db.getBlacklist() : [];

        res.json({
            guilds: guilds.size,
            members: totalMembers,
            ping: client.ws.ping,
            uptimeSeconds: Math.floor(process.uptime()),
            commandsUsed: db.getStat('slash_commands_used') || 0,
            channelsCount: client.channels.cache.size,
            topGuilds,
            totalCustomCmds,
            blacklistCount: blacklist.length,
            botAvatar: client.user.displayAvatarURL(),
            botName: client.user.username,
        });
    });

    // ─── API: Dashboard Chat (Groq IA helper) ─────────────────────────────────
    const chatRateLimits = new Map(); // ip -> { count, resetAt }

    app.post('/api/dashboard-chat', async (req, res) => {
        const ip = req.ip || req.connection?.remoteAddress || 'unknown';
        const now = Date.now();

        // Rate limit: 1 msg a cada 5s por IP
        if (chatRateLimits.has(ip)) {
            const state = chatRateLimits.get(ip);
            if (now - state.lastCall < 5000) {
                return res.status(429).json({ error: 'Aguarde 5 segundos entre mensagens.' });
            }
            if (now > state.resetAt) { state.count = 0; state.resetAt = now + 60000; }
            if (state.count >= 10) {
                return res.status(429).json({ error: 'Limite de mensagens por minuto atingido.' });
            }
            state.count++;
            state.lastCall = now;
        } else {
            chatRateLimits.set(ip, { count: 1, lastCall: now, resetAt: now + 60000 });
        }

        const { message, history } = req.body;
        if (!message || typeof message !== 'string' || message.length > 500) {
            return res.status(400).json({ error: 'Mensagem inválida (máx 500 chars).' });
        }

        try {
            const axios = require('axios');
            const apiKey = process.env.GROQ_API_KEY;
            if (!apiKey) return res.status(500).json({ error: 'GROQ_API_KEY não configurada.' });

            const systemPrompt = `Você é o assistente Itadori do dashboard web. Ajude o usuário a configurar o bot Discord "Itadori Bot". Responda em português do Brasil, de forma curta e objetiva (2-4 linhas). As funcionalidades do bot incluem: welcome, logs, verificação, embed builder, comandos personalizados, auto-roles, filtro de canais, painel de notícias, IA, moderação. Se não souber, seja honesto.`;

            const messages = [
                { role: 'system', content: systemPrompt },
                ...(Array.isArray(history) ? history.slice(-6) : []),
                { role: 'user', content: message.slice(0, 500) },
            ];

            const response = await axios.post(
                'https://api.groq.com/openai/v1/chat/completions',
                { model: process.env.GROQ_MODEL || 'llama-3.1-8b-instant', temperature: 0.3, max_completion_tokens: 200, messages },
                { headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, timeout: 15000 }
            );

            const reply = response.data?.choices?.[0]?.message?.content?.trim() || 'Desculpa, não consegui processar. Tenta de novo.';
            res.json({ reply });
        } catch (err) {
            console.error('[DASHBOARD CHAT]', err.response?.status || err.message);
            res.status(500).json({ error: 'Erro ao processar mensagem.' });
        }
    });

    // ─── API: Custom Commands CRUD ───────────────────────────────────────────
    app.get('/api/custom-commands/:guildId', requireAuth, (req, res) => {
        const { guildId } = req.params;
        try {
            const cmds = db.getCustomCommands(guildId);
            res.json(cmds);
        } catch (err) {
            res.status(500).json({ error: 'Erro ao buscar comandos.' });
        }
    });

    app.post('/api/custom-commands', requireAuth, (req, res) => {
        const { guildId, trigger, triggerType, response, responseType, embedData, requiredRoleId, cooldownSeconds } = req.body;
        if (!guildId || !trigger || !response) {
            return res.status(400).json({ error: 'guildId, trigger e response são obrigatórios.' });
        }

        // Check decoded token has admin in guild
        const decoded = req.user;
        if (!isGuildAdmin(decoded.guilds, guildId)) {
            return res.status(403).json({ error: 'Sem permissão.' });
        }

        // Check limit (50 per guild)
        const existing = db.getCustomCommands(guildId);
        if (existing.length >= 50) {
            return res.status(400).json({ error: 'Limite de 50 comandos por servidor.' });
        }

        try {
            db.setCustomCommand({
                guildId,
                trigger: trigger.trim(),
                triggerType: triggerType || 'prefix',
                response,
                responseType: responseType || 'text',
                embedData: embedData || null,
                requiredRoleId: requiredRoleId || null,
                cooldownSeconds: cooldownSeconds || 0,
                createdBy: decoded.userId || null,
            });
            db.addLog('CUSTOM_CMD', `Comando "${trigger}" criado via dashboard`, guildId, decoded.userId, decoded.username);
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: 'Erro ao criar comando.' });
        }
    });

    app.delete('/api/custom-commands/:guildId/:trigger/:triggerType', requireAuth, (req, res) => {
        const { guildId, trigger, triggerType } = req.params;
        const decoded = req.user;
        if (!isGuildAdmin(decoded.guilds, guildId)) {
            return res.status(403).json({ error: 'Sem permissão.' });
        }
        try {
            db.deleteCustomCommand(guildId, decodeURIComponent(trigger), decodeURIComponent(triggerType));
            db.addLog('CUSTOM_CMD', `Comando "${decodeURIComponent(trigger)}" deletado via dashboard`, guildId, decoded.userId, decoded.username);
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: 'Erro ao deletar.' });
        }
    });

    app.patch('/api/custom-commands/:guildId/:trigger/:triggerType/toggle', requireAuth, (req, res) => {
        const { guildId, trigger, triggerType } = req.params;
        const { enabled } = req.body;
        const decoded = req.user;
        if (!isGuildAdmin(decoded.guilds, guildId)) {
            return res.status(403).json({ error: 'Sem permissão.' });
        }
        try {
            db.toggleCustomCommand(guildId, decodeURIComponent(trigger), decodeURIComponent(triggerType), enabled);
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: 'Erro ao alternar.' });
        }
    });

    server.listen(port, () => {
        console.log(`[DASHBOARD-V2] Domínio Erguido em http://localhost:${port}`);
    });
}

module.exports = startDashboard;
