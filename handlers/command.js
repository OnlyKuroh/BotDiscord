const fs = require('fs');
const path = require('path');

module.exports = (client) => {
    const commandsPath = path.join(__dirname, '..', 'commands');
    if (!fs.existsSync(commandsPath)) fs.mkdirSync(commandsPath);

    const categories = fs.readdirSync(commandsPath);
    for (const category of categories) {
        const categoryPath = path.join(commandsPath, category);
        if (!fs.lstatSync(categoryPath).isDirectory()) continue;

        const commandFiles = fs.readdirSync(categoryPath).filter(file => file.endsWith('.js'));
        for (const file of commandFiles) {
            const filePath = path.join(categoryPath, file);
            const command = require(filePath);
            
            command.category = category;

            const commandName = command.data?.name || command.prefixOnlyName;

            if (commandName) {
                client.commands.set(commandName, command);
                if (command.aliases && Array.isArray(command.aliases)) {
                    for (const alias of command.aliases) {
                        client.aliases.set(alias, commandName);
                    }
                }
            } else {
                console.log(`[AVISO] Falta um dos pilares no arquivo ${filePath}. Corte inválido.`);
            }
        }
    }
};
