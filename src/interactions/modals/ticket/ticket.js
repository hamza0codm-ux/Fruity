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
    normalTicketModal,
    merchTicketModal,

    createTicketModalHandler,
    closeTicketModalHandler,
];
