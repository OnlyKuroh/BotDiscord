/**
 * scripts/download-lol-assets.js
 *
 * Baixa os assets estáticos do LoL para a pasta assets/lol/ localmente.
 * Uso: node scripts/download-lol-assets.js [--force]
 *
 * Assets baixados:
 *   assets/lol/ranks/           — emblemas de rank grandes
 *   assets/lol/ranks-mini/      — mini crests de rank
 *   assets/lol/lanes/           — ícones de posição
 *   assets/lol/mastery/         — ícones de maestria 1–10
 *   assets/lol/honor/           — ícones de honra 0–5
 *   assets/lol/champions/       — ícones quadrados de campeão (DDragon latest)
 *   assets/lol/spells/          — ícones de summoner spell
 *   assets/lol/runes/           — ícones de runa/keystone (DDragon runesReforged)
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ASSETS_DIR = path.join(ROOT, 'assets', 'lol');
const FORCE = process.argv.includes('--force');

const RANKS = ['iron', 'bronze', 'silver', 'gold', 'platinum', 'emerald', 'diamond', 'master', 'grandmaster', 'challenger', 'unranked'];
const LANES = ['top', 'jungle', 'middle', 'bottom', 'utility', 'unselected'];

// ─── HTTP helpers ──────────────────────────────────────────────────────────────

function fetchJson(url) {
    return new Promise((resolve, reject) => {
        const client = url.startsWith('https') ? https : http;
        const req = client.get(url, { timeout: 15000 }, (res) => {
            if (res.statusCode === 301 || res.statusCode === 302) {
                res.resume();
                return fetchJson(res.headers.location).then(resolve).catch(reject);
            }
            if (res.statusCode !== 200) {
                res.resume();
                return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
            }
            let body = '';
            res.on('data', (chunk) => { body += chunk; });
            res.on('end', () => {
                try { resolve(JSON.parse(body)); }
                catch (e) { reject(e); }
            });
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error(`Timeout: ${url}`)); });
    });
}

function download(fileUrl, destPath, redirectCount = 0) {
    return new Promise((resolve, reject) => {
        if (redirectCount > 5) return reject(new Error('Too many redirects'));
        const client = fileUrl.startsWith('https') ? https : http;
        const req = client.get(fileUrl, { timeout: 20000 }, (res) => {
            if (res.statusCode === 301 || res.statusCode === 302) {
                res.resume();
                return download(res.headers.location, destPath, redirectCount + 1).then(resolve).catch(reject);
            }
            if (res.statusCode !== 200) {
                res.resume();
                return reject(new Error(`HTTP ${res.statusCode}`));
            }
            const file = fs.createWriteStream(destPath);
            res.pipe(file);
            file.on('finish', () => file.close(resolve));
            file.on('error', (err) => { fs.unlink(destPath, () => {}); reject(err); });
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    });
}

function ensureDir(dir) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function downloadWithFallback(asset) {
    ensureDir(asset.destDir);
    const destPath = path.join(asset.destDir, asset.fileName);

    if (!FORCE && fs.existsSync(destPath) && fs.statSync(destPath).size > 500) {
        process.stdout.write(`  skip  ${asset.fileName}\n`);
        return { status: 'skip' };
    }

    for (const tryUrl of asset.urls) {
        try {
            await download(tryUrl, destPath);
            const size = fs.existsSync(destPath) ? fs.statSync(destPath).size : 0;
            if (size > 200) {
                process.stdout.write(`  ok    ${asset.fileName}  (${(size / 1024).toFixed(1)} KB)\n`);
                return { status: 'ok' };
            }
            if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
        } catch {
            // tenta próximo URL
        }
    }

    process.stdout.write(`  FAIL  ${asset.fileName}\n`);
    return { status: 'fail', fileName: asset.fileName };
}

// ─── Builders de lista de assets ──────────────────────────────────────────────

function buildStaticList() {
    const list = [];

    // Emblemas de rank grandes
    for (const rank of RANKS) {
        const urls = [
            `https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/ranked-emblem/emblem-${rank}.png`,
        ];
        if (rank === 'unranked') {
            urls.push(
                `https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/ranked-mini-crests/unranked.png`,
            );
        }
        list.push({ destDir: path.join(ASSETS_DIR, 'ranks'), fileName: `${rank}.png`, urls });
    }

    // Mini crests de rank
    for (const rank of RANKS) {
        const urls = [
            `https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/ranked-mini-crests/${rank}.png`,
        ];
        if (rank === 'emerald') {
            urls.push(
                `https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/ranked-mini-crests/${rank}.svg`,
            );
        }
        list.push({ destDir: path.join(ASSETS_DIR, 'ranks-mini'), fileName: `${rank}.png`, urls });
    }

    // Lanes
    for (const lane of LANES) {
        list.push({
            destDir: path.join(ASSETS_DIR, 'lanes'),
            fileName: `${lane}.png`,
            urls: [
                `https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-clash/global/default/assets/images/position-selector/positions/icon-position-${lane}.png`,
                `https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/positions/${lane}.png`,
            ],
        });
    }

    // Maestrias 1–10 (sistema 2024+)
    for (let level = 1; level <= 10; level++) {
        const urls = [];
        if (level >= 4) {
            urls.push(
                `https://raw.communitydragon.org/latest/game/assets/ux/mastery/legendarychampionmastery/masterycrest_level${level}.cm_updates.png`,
            );
        }
        urls.push(`https://wiki.leagueoflegends.com/en-us/images/Mastery_${level}_Banner.png`);
        if (level === 10) {
            urls.push(`https://wiki.leagueoflegends.com/en-us/images/Mastery_10%2B_Banner.png`);
        }
        list.push({ destDir: path.join(ASSETS_DIR, 'mastery'), fileName: `${level}.png`, urls });
    }

    // Honras 0–5
    for (let level = 0; level <= 5; level++) {
        const fileName = level === 0 ? 'emblem_0.png' : `emblem_level_${level}.png`;
        list.push({
            destDir: path.join(ASSETS_DIR, 'honor'),
            fileName: `${level}.png`,
            urls: [
                `https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/honor/profile/${fileName}`,
            ],
        });
    }

    return list;
}

async function getLatestDDragonVersion() {
    try {
        const versions = await fetchJson('https://ddragon.leagueoflegends.com/api/versions.json');
        return versions[0];
    } catch {
        return null;
    }
}

async function buildChampionList(version) {
    console.log(`\nBuscando catálogo de campeões (DDragon ${version})...`);
    let data;
    try {
        const res = await fetchJson(
            `https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/champion.json`
        );
        data = res.data || {};
    } catch (e) {
        console.error('  Erro ao buscar catálogo de campeões:', e.message);
        return [];
    }

    const list = [];
    for (const [championId] of Object.entries(data)) {
        list.push({
            destDir: path.join(ASSETS_DIR, 'champions'),
            fileName: `${championId}.png`,
            urls: [
                `https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${championId}.png`,
            ],
        });
    }
    console.log(`  ${list.length} campeões encontrados (inclui Shyvana e novos patches 2026)`);
    return list;
}

async function buildSpellList(version) {
    console.log(`\nBuscando catálogo de summoner spells (DDragon ${version})...`);
    let data;
    try {
        const res = await fetchJson(
            `https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/summoner.json`
        );
        data = res.data || {};
    } catch (e) {
        console.error('  Erro ao buscar summoner spells:', e.message);
        return [];
    }

    const list = [];
    for (const [, spell] of Object.entries(data)) {
        const iconFile = spell.image?.full;
        if (!iconFile) continue;
        list.push({
            destDir: path.join(ASSETS_DIR, 'spells'),
            fileName: iconFile,
            urls: [
                `https://ddragon.leagueoflegends.com/cdn/${version}/img/spell/${iconFile}`,
            ],
        });
    }
    console.log(`  ${list.length} spells encontradas`);
    return list;
}

async function buildRuneList(version) {
    console.log(`\nBuscando catálogo de runas (DDragon ${version})...`);
    let styles;
    try {
        styles = await fetchJson(
            `https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/runesReforged.json`
        );
    } catch (e) {
        console.error('  Erro ao buscar runas:', e.message);
        return [];
    }

    const list = [];
    for (const style of (styles || [])) {
        // Ícone do estilo (ex: Precision, Domination)
        if (style.icon) {
            const fileName = style.icon.split('/').pop();
            list.push({
                destDir: path.join(ASSETS_DIR, 'runes'),
                fileName,
                urls: [`https://ddragon.leagueoflegends.com/cdn/img/${style.icon}`],
            });
        }
        // Ícones das runas individuais e keystones
        for (const slot of (style.slots || [])) {
            for (const rune of (slot.runes || [])) {
                if (rune.icon) {
                    const fileName = rune.icon.split('/').pop();
                    list.push({
                        destDir: path.join(ASSETS_DIR, 'runes'),
                        fileName,
                        urls: [`https://ddragon.leagueoflegends.com/cdn/img/${rune.icon}`],
                    });
                }
            }
        }
    }

    // Dedup por fileName
    const seen = new Set();
    const deduped = list.filter((a) => {
        if (seen.has(a.fileName)) return false;
        seen.add(a.fileName);
        return true;
    });

    console.log(`  ${deduped.length} ícones de runas encontrados`);
    return deduped;
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function runSection(label, assets, results) {
    if (assets.length === 0) return;
    console.log(`\n── ${label} (${assets.length}) ──`);
    for (const asset of assets) {
        const result = await downloadWithFallback(asset);
        if (result.status === 'ok') results.ok++;
        else if (result.status === 'skip') results.skip++;
        else results.fail.push(result.fileName);
    }
}

async function main() {
    console.log('Baixando assets do LoL para assets/lol/ ...');
    if (FORCE) console.log('Modo --force: sobrescreve arquivos existentes\n');
    ensureDir(ASSETS_DIR);

    const version = await getLatestDDragonVersion();
    if (!version) {
        console.error('Não foi possível obter a versão do DDragon. Verifique sua conexão.');
        process.exit(1);
    }
    console.log(`Versão DDragon: ${version}`);

    const results = { ok: 0, skip: 0, fail: [] };

    const [championAssets, spellAssets, runeAssets] = await Promise.all([
        buildChampionList(version),
        buildSpellList(version),
        buildRuneList(version),
    ]);

    await runSection('Ranks (emblemas grandes)', buildStaticList().filter(a => a.destDir.endsWith('ranks') && !a.destDir.endsWith('ranks-mini')), results);
    await runSection('Ranks-mini (crests)', buildStaticList().filter(a => a.destDir.endsWith('ranks-mini')), results);
    await runSection('Lanes', buildStaticList().filter(a => a.destDir.endsWith('lanes')), results);
    await runSection('Maestria 1–10', buildStaticList().filter(a => a.destDir.endsWith('mastery')), results);
    await runSection('Honra 0–5', buildStaticList().filter(a => a.destDir.endsWith('honor')), results);
    await runSection('Campeões', championAssets, results);
    await runSection('Summoner Spells', spellAssets, results);
    await runSection('Runas', runeAssets, results);

    console.log(`\n✓ Pronto! ok=${results.ok}  skip=${results.skip}  fail=${results.fail.length}`);
    if (results.fail.length > 0) {
        console.log('Faltaram:', results.fail.join(', '));
    }
}

main().catch((err) => { console.error('Erro fatal:', err); process.exit(1); });
