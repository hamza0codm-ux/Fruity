import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export async function loadCommands(client) {
    const commandsPath = path.join(process.cwd(), 'src', 'commands');

    if (!fs.existsSync(commandsPath)) {
        return;
    }

    const commandFolders = fs.readdirSync(commandsPath, {
        withFileTypes: true,
    });

    for (const folder of commandFolders) {
        if (!folder.isDirectory()) continue;

        const folderPath = path.join(commandsPath, folder.name);

        const files = fs
            .readdirSync(folderPath)
            .filter(file => file.endsWith('.js'));

        for (const file of files) {
            const filePath = path.join(folderPath, file);
            const command = await import(pathToFileURL(filePath).href);

            if (!command.default?.name || typeof command.default.execute !== 'function') {
                console.warn(`[COMMAND] Skipping invalid command: ${file}`);
                continue;
            }

            client.commands.set(command.default.name, command.default);

            console.log(`[COMMAND] Loaded ${command.default.name}`);
        }
    }
}
