require('dotenv').config();
const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

const commands = [];
const commandsPath = path.join(__dirname, 'commands');

const commandFolders = fs.readdirSync(commandsPath);

for (const folder of commandFolders) {
    const folderPath = path.join(commandsPath, folder);
    if(!fs.lstatSync(folderPath).isDirectory()) continue;
    
    // Suportar subpastas como comandos/administrador/
    const isCategoryDir = fs.lstatSync(folderPath).isDirectory();
    if(isCategoryDir) {
        const commandFiles = fs.readdirSync(folderPath).filter(file => file.endsWith('.js'));
        for (const file of commandFiles) {
            const filePath = path.join(folderPath, file);
            const command = require(filePath);
            if ('data' in command) {
                commands.push(command.data.toJSON());
            } else {
                console.log(`[AVISO] Falta a lâmina "data" em ${filePath}.`);
            }
        }
    }
}

const rest = new REST().setToken(process.env.DISCORD_TOKEN);

(async () => {
    try {
        console.log(`Puxando ${commands.length} comandos para a realidade... A Engrenagem começou a girar.`);

        const data = await rest.put(
            Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
            { body: commands },
        );

        console.log(`Perfeito. ${data.length} comandos cravados na base de dados do servidor.`);
    } catch (error) {
        console.error(error);
    }
})();
