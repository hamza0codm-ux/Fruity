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
    priorityTicketHandler,
    pinTicketHandler,
    unclaimTicketHandler,
    reopenTicketHandler,
    deleteTicketHandler,
} from '../../../handlers/ticketButtons.js';


export default [

    // =========================================================
    // NORMAL TICKET CREATION
    // =========================================================

    normalTicketCreateButton,


    // =========================================================
    // MERCH TICKET CREATION
    // =========================================================

    merchTicketCreateButton,


    // =========================================================
    // TICKET CONTROLS
    // =========================================================

    closeTicketHandler,

    claimTicketHandler,

    priorityMenuHandler,

    priorityTicketHandler,

    pinTicketHandler,

    unclaimTicketHandler,

    reopenTicketHandler,

    deleteTicketHandler,
];
