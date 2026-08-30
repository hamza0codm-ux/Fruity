import {
    normalTicketModal,
} from '../../../tickets/normalTickets.js';

import {
    merchTicketModal,
} from '../../../tickets/merchTickets.js';

import {
    createTicketModalHandler,
    closeTicketModalHandler,
} from '../../../handlers/ticketButtons.js';


export default [

    // Normal ticket forms
    normalTicketModal,

    // Merch ticket forms
    merchTicketModal,

    // Legacy ticket form
    createTicketModalHandler,

    // Ticket close form
    closeTicketModalHandler,
];
