import { EmbedBuilder } from 'discord.js';

export function createRulesEmbed() {
    const rules = [
        '**🌐 Official Server Guidelines**\n\nWelcome to our community. This server represents our brand, our players, and our community. Keep it professional. Keep it respectful. Keep it elite.',

        '**💬 1. English Only**\n\nAll conversations must be in English to ensure transparency and effective moderation. Refrain from engaging in heated debates on politics, religion, or controversial topics to maintain a friendly environment.',

        '**🤝 2. Respect Everyone & Protect Privacy**\n\nTreat all members with maturity, kindness, and common sense. Do not share the private information of others without consent. There is absolute zero tolerance for racism, sexism, homophobia, harassment, doxing, personal attacks, discrimination, or hate speech of any kind. Respect privacy and personal boundaries at all times.',

        '**🤬 3. No Inappropriate Language**\n\nExcessive swearing or offensive language is not allowed. Keep it competitive — not toxic.',

        '**🛑 4. No Spamming**\n\nDo not flood chats with repeated messages, excessive links, or content that disrupts conversations. Do not spam emojis or mass ping members and moderators.',

        '**🔞 5. No NSFW Content**\n\nThis is a professional environment built to keep the server safe for everyone. Explicit, pornographic, or adult content—including NSFW images, videos, or links—is strictly prohibited. Violators will be banned.',

        '**📢 6. No Advertisements**\n\nNo server advertising, self-promotion, or DM advertising is allowed. External server promotion will result in a mute. Partnerships must go through management.',

        '**⚠️ 7. No Threats or Impersonation**\n\nThreats of any kind are forbidden. Do not impersonate other members, staff, or public figures. Doing so will result in an immediate ban.',

        '**🛡️ 8. Respect Staff Decisions**\n\nFollow the instructions of moderators and leadership; their decisions are final. Do not start public arguments about punishments, create drama, or ragebait personnel. If you have concerns, handle them privately and respectfully.',

        '**🎉 9. Do Not Ruin Community Channels**\n\nPlease post in the relevant channels and avoid flooding off-topic discussions into topic-specific areas. Do not disrupt fun community channels. Trolling, ruining games, or intentionally disturbing activities will result in timeouts.',

        '**📜 10. Follow Discord Terms of Service**\n\nAll users must adhere to the official Discord Terms of Service and Community Guidelines.',

        '**🚨 Final Notice**\n\nFailure to follow these rules will result in:\n• ⚠️ Warnings\n• ⏰ Timeouts\n• 🔨 Kicks\n• ⛔ Permanent bans',
    ];

    const rulesImage = 'PASTE_YOUR_IMAGE_URL_HERE';

    return new EmbedBuilder()
        .setTitle('<:white_rules:1544646747186274344> Fruity Rules')
        .setDescription(rules.join('\n\n'))
        .setColor(0xF8D568)
        .setImage(rulesImage)
        .setFooter({
            text: 'Fruity • Rules',
        })
        .setTimestamp();
}
