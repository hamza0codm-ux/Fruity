import { config } from '../config/config.js';

export default {
    name: 'messageCreate',

    async execute(message) {
        if (message.author.bot) return;
        if (!message.guild) return;

        if (!message.content.startsWith(config.prefix)) return;

        const args = message.content
            .slice(config.prefix.length)
            .trim()
            .split(/\s+/);

        const commandName = args.shift()?.toLowerCase();

        if (!commandName) return;

        const command = message.client.commands.get('moderation');

        if (!command) return;

        const moderationCommands = [
            'ban',
            'unban',
            'kick',
            'timeout',
            'untimeout',
            'purge',
            'give',
            'remove',
        ];

        if (!moderationCommands.includes(commandName)) return;

        await command.execute(
            message,
            [commandName, ...args],
            message.client
        );
    },
};
