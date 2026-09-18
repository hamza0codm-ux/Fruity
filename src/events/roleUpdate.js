import { EmbedBuilder } from 'discord.js';
import { sendLog } from '../services/logger.js';

export default {
    name: 'roleUpdate',

    async execute(oldRole, newRole) {
        const changes = [];

        if (oldRole.name !== newRole.name) {
            changes.push(`**Name:** ${oldRole.name} → ${newRole.name}`);
        }

        if (oldRole.hexColor !== newRole.hexColor) {
            changes.push(`**Color:** ${oldRole.hexColor} → ${newRole.hexColor}`);
        }

        if (oldRole.permissions.bitfield !== newRole.permissions.bitfield) {
            changes.push('**Permissions:** Changed');
        }

        if (oldRole.hoist !== newRole.hoist) {
            changes.push(`**Hoisted:** ${oldRole.hoist} → ${newRole.hoist}`);
        }

        if (oldRole.mentionable !== newRole.mentionable) {
            changes.push(`**Mentionable:** ${oldRole.mentionable} → ${newRole.mentionable}`);
        }

        // Ignore role position/order changes.
        if (!changes.length) return;

        const embed = new EmbedBuilder()
            .setTitle('🟡 Role Updated')
            .setColor(0xFEE75C)
            .addFields(
                {
                    name: 'Role',
                    value: `${newRole} (\`${newRole.id}\`)`,
                },
                {
                    name: 'Changes',
                    value: changes.join('\n'),
                }
            )
            .setTimestamp();

        await sendLog(newRole.client, 'server', embed);
    },
};
