import {
    closeTicketHandler,
    claimTicketHandler,
    pinTicketHandler,
    unclaimTicketHandler,
    reopenTicketHandler,
    deleteTicketHandler,
} from '../../../handlers/ticketButtons.js';

import {
    priorityDropdownButton,
} from './priority.js';

export default [
    // Close
    closeTicketHandler,

    // Claim
    claimTicketHandler,

    // Priority dropdown
    priorityDropdownButton,

    // Other ticket controls
    pinTicketHandler,
    unclaimTicketHandler,
    reopenTicketHandler,
    deleteTicketHandler,
];
