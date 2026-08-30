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
  // Normal tickets
  normalTicketModal,

  // Merch tickets
  merchTicketModal,

  // Legacy ticket system
  createTicketModalHandler,

  // Ticket close form
  closeTicketModalHandler,
];
