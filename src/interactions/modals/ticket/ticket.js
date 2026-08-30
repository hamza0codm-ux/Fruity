import {
    normalTicketModal,
} from '../../../tickets/normalTickets.js';

import {
    merchTicketModal,
} from '../../../tickets/merchTickets.js';

import {
    createTicketModalHandler,
    closeTicketModalHandler,
    priorityModalTicketHandler,
} from '../../../handlers/ticketButtons.js';


export default [
    // ==========================================
    // NORMAL TICKET FORMS
    // ==========================================

    normalTicketModal,


    // ==========================================
    // MERCH TICKET FORMS
    // ==========================================

    merchTicketModal,


    // ==========================================
    // LEGACY TICKET FORM
    // ==========================================

    createTicketModalHandler,


    // ==========================================
    // CLOSE TICKET FORM
    // ==========================================

    closeTicketModalHandler,


    // ==========================================
    // PRIORITY FORM
    // ==========================================

    priorityModalTicketHandler,
];
