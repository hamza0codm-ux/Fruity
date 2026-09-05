import { readdir } from 'fs/promises';
import { join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname } from 'path';
import { logger } from '../../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Recursively find all JavaScript event files.
 */
async function getEventFiles(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    const files = [];

    for (const entry of entries) {
        const fullPath = join(directory, entry.name);

        if (entry.isDirectory()) {
            const nestedFiles = await getEventFiles(fullPath);
            files.push(...nestedFiles);
        } else if (entry.isFile() && entry.name.endsWith('.js')) {
            files.push(fullPath);
        }
    }

    return files;
}

export default async function loadEvents(client) {
    const eventsPath = join(__dirname, '../../events');

    let eventFiles;

    try {
        eventFiles = await getEventFiles(eventsPath);
    } catch (error) {
        logger.error('❌ Failed to scan events directory:', error);
        return;
    }

    logger.info(`🔥 EVENT LOADER: Found ${eventFiles.length} event files`);

    for (const filePath of eventFiles) {
        const relativeFile = filePath
            .replace(eventsPath, '')
            .replace(/\\/g, '/')
            .replace(/^\/+/, '');

        try {
            const { default: event } = await import(
                pathToFileURL(filePath).href
            );

            if (!event?.name || typeof event.execute !== 'function') {
                logger.warn(
                    `⚠️ Event ${relativeFile} is missing required "name" or "execute" properties.`
                );
                continue;
            }

            const safeExecute = async (...args) => {
                try {
                    await event.execute(...args, client);
                } catch (error) {
                    logger.error(
                        `❌ Error executing event ${event.name}:`,
                        error
                    );
                }
            };

            if (event.once) {
                client.once(event.name, safeExecute);

                logger.info(
                    `✅ Registered once event: ${event.name} (${relativeFile})`
                );
            } else {
                client.on(event.name, safeExecute);

                logger.info(
                    `🔥 EVENT REGISTERED: ${event.name} (${relativeFile})`
                );
            }
        } catch (error) {
            logger.error(
                `❌ Error loading event ${relativeFile}:`,
                error
            );
        }
    }
}
