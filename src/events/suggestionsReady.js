// src/events/suggestionsReady.js

import {
    Events,
} from 'discord.js';

import {
    reconcileSuggestionPanel,
} from '../suggestions/suggestions.js';

import {
    logger,
} from '../utils/logger.js';


export default {

    name: Events.ClientReady,

    once: true,

    async execute(client) {
        try {

            await reconcileSuggestionPanel(
                client
            );

            logger.info(
                'Suggestions system initialized successfully.'
            );

        } catch (error) {

            logger.error(
                'Failed to initialize Suggestions system:',
                error
            );
        }
    },
};
