import 'dotenv/config';

import {
    Client,
    Collection,
    GatewayIntentBits,
    Partials,
} from 'discord.js';

import { loadCommands } from './handlers/commandHandler.js';
import { loadEvents } from './handlers/eventHandler.js';

if (!process.env.TOKEN) {
    console.error('❌ TOKEN is missing from .env');
    process.exit(1);
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildModeration,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],

    partials: [
        Partials.Message,
        Partials.Channel,
    ],
});

client.commands = new Collection();

await loadCommands(client);
await loadEvents(client);

process.on('unhandledRejection', error => {
    console.error('Unhandled promise rejection:', error);
});

process.on('uncaughtException', error => {
    console.error('Uncaught exception:', error);
});

await client.login(process.env.TOKEN);
