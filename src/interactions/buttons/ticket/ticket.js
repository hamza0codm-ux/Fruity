import {
    normalTicketCreateButton,
} from '../../../tickets/normalTickets.js';

import {
    merchTicketCreateButton,
} from '../../../tickets/merchTickets.js';

import {
    closeTicketHandler,
    claimTicketHandler,
    priorityMenuHandler,
    pinTicketHandler,
    unclaimTicketHandler,
    reopenTicketHandler,
    deleteTicketHandler,
} from '../../../handlers/ticketButtons.js';


export default [
    // =========================================================
    // TICKET CREATION
    // =========================================================

    normalTicketCreateButton,
    merchTicketCreateButton,


    // =========================================================
    // TICKET CONTROLS
    // =========================================================

    // 🔒 Close
    closeTicketHandler,

    // 👋 Claim
    claimTicketHandler,

    // 💼 Priority
    // Opens the priority select menu
    priorityMenuHandler,

    // 📌 Pin
    pinTicketHandler,

    // Unclaim
    unclaimTicketHandler,

    // Reopen
    reopenTicketHandler,

    // Delete
    deleteTicketHandler,
];
