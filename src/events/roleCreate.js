import { EmbedBuilder } from 'discord.js';
import { sendLog } from '../services/logger.js';

export default {
    name: 'roleCreate',

    async execute(role) {
        const embed = new EmbedBuilder()
            .setTitle('🟢 Role Created')
            .setColor(0x57F287)
            .addFields(
                {
                    name: 'Role',
                    value: `${role} (\`${role.id}\`)`,
                },
                {
                    name: 'Name',
                    value: role.name,
                }
            )
            .setTimestamp();

        await sendLog(role.client, 'server', embed);
    },
};
