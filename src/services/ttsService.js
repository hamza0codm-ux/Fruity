import {
    AudioPlayerStatus,
    NoSubscriberBehavior,
    StreamType,
    createAudioPlayer,
    createAudioResource,
    joinVoiceChannel,
    entersState,
    VoiceConnectionStatus,
} from '@discordjs/voice';

import gtts from 'node-gtts';
import ffmpegPath from 'ffmpeg-static';

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const enabledGuilds = new Set();
const players = new Map();
const connections = new Map();
const queues = new Map();

const MAX_TTS_LENGTH = 300;

export function isTTSEnabled(guildId) {
    return enabledGuilds.has(guildId);
}

export function setTTSEnabled(guildId, enabled) {
    if (enabled) {
        enabledGuilds.add(guildId);
    } else {
        enabledGuilds.delete(guildId);
    }
}

function getPlayer(guildId) {
    let player = players.get(guildId);

    if (!player) {
        player = createAudioPlayer({
            behaviors: {
                noSubscriber: NoSubscriberBehavior.Stop,
            },
        });

        players.set(guildId, player);
    }

    return player;
}

function getQueue(guildId) {
    let queue = queues.get(guildId);

    if (!queue) {
        queue = [];
        queues.set(guildId, queue);
    }

    return queue;
}

async function generateTTS(text) {
    const filename = `fruity-tts-${crypto.randomUUID()}.mp3`;
    const filepath = path.join(os.tmpdir(), filename);

    const speech = gtts('en');

    await new Promise((resolve, reject) => {
        speech.save(filepath, text, error => {
            if (error) {
                reject(error);
                return;
            }

            resolve();
        });
    });

    return filepath;
}

async function playNext(guildId) {
    const queue = getQueue(guildId);

    if (queue.length === 0) {
        return;
    }

    const item = queue[0];

    try {
        const filepath = await generateTTS(item.text);

        const player = getPlayer(guildId);

        const resource = createAudioResource(filepath, {
            inputType: StreamType.Arbitrary,
            inlineVolume: false,
        });

        player.play(resource);

        const connection = connections.get(guildId);

        if (connection) {
            connection.subscribe(player);
        }

        await new Promise(resolve => {
            const onIdle = state => {
                if (state.status !== AudioPlayerStatus.Idle) {
                    return;
                }

                player.off(AudioPlayerStatus.Idle, onIdle);
                resolve();
            };

            player.on(AudioPlayerStatus.Idle, onIdle);
        });

        await fs.promises.unlink(filepath).catch(() => {});

        queue.shift();

        if (queue.length > 0) {
            await playNext(guildId);
        }
    } catch (error) {
        console.error('[TTS] Failed to play speech:', error);

        queue.shift();

        if (queue.length > 0) {
            await playNext(guildId);
        }
    }
}

export async function speakInVoiceChannel({
    guild,
    member,
    text,
}) {
    if (!guild || !member) {
        throw new Error('Guild or member is missing.');
    }

    if (!text || !text.trim()) {
        throw new Error('No text was provided.');
    }

    const cleanText = text
        .replace(/<@!?\d+>/g, '')
        .replace(/<@&\d+>/g, '')
        .replace(/<#\d+>/g, '')
        .replace(/https?:\/\/\S+/gi, 'link')
        .trim();

    if (!cleanText) {
        throw new Error('There is no readable text to speak.');
    }

    if (cleanText.length > MAX_TTS_LENGTH) {
        throw new Error(
            `TTS messages are limited to ${MAX_TTS_LENGTH} characters.`
        );
    }

    const voiceChannel = member.voice?.channel;

    if (!voiceChannel) {
        throw new Error('You must be in a voice channel to use TTS.');
    }

    const botMember = guild.members.me;

    if (!botMember) {
        throw new Error('I could not find my bot member in this server.');
    }

    const permissions = voiceChannel.permissionsFor(botMember);

    if (!permissions?.has('Connect')) {
        throw new Error(
            'I need the **Connect** permission in that voice channel.'
        );
    }

    if (!permissions?.has('Speak')) {
        throw new Error(
            'I need the **Speak** permission in that voice channel.'
        );
    }

    let connection = connections.get(guild.id);

    if (
        !connection ||
        connection.state.status === VoiceConnectionStatus.Destroyed
    ) {
        connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: guild.id,
            adapterCreator: guild.voiceAdapterCreator,
            selfDeaf: true,
        });

        connections.set(guild.id, connection);

        await entersState(
            connection,
            VoiceConnectionStatus.Ready,
            15_000
        );
    } else if (connection.joinConfig.channelId !== voiceChannel.id) {
        connection.destroy();

        connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: guild.id,
            adapterCreator: guild.voiceAdapterCreator,
            selfDeaf: true,
        });

        connections.set(guild.id, connection);

        await entersState(
            connection,
            VoiceConnectionStatus.Ready,
            15_000
        );
    }

    const queue = getQueue(guild.id);

    queue.push({
        text: cleanText,
        userId: member.id,
        voiceChannelId: voiceChannel.id,
    });

    const player = getPlayer(guild.id);
    connection.subscribe(player);

    if (player.state.status === AudioPlayerStatus.Idle) {
        await playNext(guild.id);
    }
}

export function disconnectTTS(guildId) {
    const player = players.get(guildId);

    if (player) {
        player.stop(true);
        players.delete(guildId);
    }

    const connection = connections.get(guildId);

    if (connection) {
        connection.destroy();
        connections.delete(guildId);
    }

    queues.delete(guildId);
}

export function cleanupTTS() {
    for (const guildId of connections.keys()) {
        disconnectTTS(guildId);
    }
}
