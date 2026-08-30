import createTicketHandler, {
    closeTicketHandler,
    claimTicketHandler,
    priorityTicketHandler,
    pinTicketHandler,
    unclaimTicketHandler,
    reopenTicketHandler,
    deleteTicketHandler,
} from '../../../handlers/ticketButtons.js';

import {
    normalTicketCreateButton,
} from '../../../tickets/normalTickets.js';

import {
    merchTicketCreateButton,
} from '../../../tickets/merchTickets.js';

export default [
    // Legacy ticket creation
    createTicketHandler,

    // Normal ticket creation buttons
    normalTicketCreateButton,

    // Merch ticket creation buttons
    merchTicketCreateButton,

    // Ticket controls
    closeTicketHandler,
    claimTicketHandler,
    priorityTicketHandler,
    pinTicketHandler,
    unclaimTicketHandler,
    reopenTicketHandler,
    deleteTicketHandler,
];
