/**
 * scripts/list-app-emojis.js
 * Lista todos os emojis do app do Discord (aba Emojis no Developer Portal).
 * Uso: node scripts/list-app-emojis.js
 */

require('dotenv').config();
const https = require('https');

const CLIENT_ID = process.env.CLIENT_ID;
const TOKEN = process.env.DISCORD_TOKEN;

if (!CLIENT_ID || !TOKEN) {
    console.error('Defina CLIENT_ID e DISCORD_TOKEN no .env');
    process.exit(1);
}

function get(url) {
    return new Promise((resolve, reject) => {
        https.get(url, {
            headers: { Authorization: `Bot ${TOKEN}` },
            timeout: 10000,
        }, (res) => {
            let body = '';
            res.on('data', (c) => body += c);
            res.on('end', () => {
                try { resolve(JSON.parse(body)); }
                catch (e) { reject(e); }
            });
        }).on('error', reject).on('timeout', () => reject(new Error('Timeout')));
    });
}

async function main() {
    const data = await get(`https://discord.com/api/v10/applications/${CLIENT_ID}/emojis`);

    if (data.message) {
        console.error('Erro da API:', data.message);
        process.exit(1);
    }

    const emojis = data.items || data || [];
    console.log(`Total: ${emojis.length} emojis\n`);

    for (const e of emojis) {
        console.log(`${e.name}: ${e.id}`);
    }

    // Também salva em JSON para facilitar
    const fs = require('fs');
    fs.writeFileSync('scripts/app-emojis.json', JSON.stringify(emojis, null, 2));
    console.log('\nSalvo em scripts/app-emojis.json');
}

main().catch((err) => { console.error('Erro:', err.message); process.exit(1); });
