import createTicketHandler, {
    closeTicketHandler,
    claimTicketHandler,
    priorityMenuHandler,
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
    // ==========================================
    // LEGACY TICKET SYSTEM
    // ==========================================
    createTicketHandler,


    // ==========================================
    // NORMAL TICKET CREATION
    // ==========================================
    normalTicketCreateButton,


    // ==========================================
    // MERCH TICKET CREATION
    // ==========================================
    merchTicketCreateButton,


    // ==========================================
    // TICKET CONTROLS
    // ==========================================
    closeTicketHandler,

    claimTicketHandler,

    // Priority button:
    // ticket_priority_menu
    priorityMenuHandler,

    // Priority selection:
    // ticket_priority
    priorityTicketHandler,

    pinTicketHandler,

    unclaimTicketHandler,

    reopenTicketHandler,

    deleteTicketHandler,
];
