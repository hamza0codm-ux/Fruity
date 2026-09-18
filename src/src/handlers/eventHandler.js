import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export async function loadEvents(client) {
    const eventsPath = path.join(process.cwd(), 'src', 'events');

    if (!fs.existsSync(eventsPath)) {
        return;
    }

    const files = fs
        .readdirSync(eventsPath)
        .filter(file => file.endsWith('.js'));

    for (const file of files) {
        const filePath = path.join(eventsPath, file);
        const event = await import(pathToFileURL(filePath).href);

        if (!event.default?.name || typeof event.default.execute !== 'function') {
            console.warn(`[EVENT] Skipping invalid event: ${file}`);
            continue;
        }

        if (event.default.once) {
            client.once(event.default.name, (...args) =>
                event.default.execute(...args)
            );
        } else {
            client.on(event.default.name, (...args) =>
                event.default.execute(...args)
            );
        }

        console.log(`[EVENT] Loaded ${event.default.name}`);
    }
}
