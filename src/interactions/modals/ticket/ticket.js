import {
  createTicketModalHandler,
  closeTicketModalHandler,
} from '../../../handlers/ticketButtons.js';

import {
  normalTicketModal,
} from '../../../tickets/normalTickets.js';

import {
  merchTicketModal,
} from '../../../tickets/merchTickets.js';

export default [
  // Legacy ticket form
  createTicketModalHandler,

  // Normal ticket forms
  normalTicketModal,

  // Merch ticket forms
  merchTicketModal,

  // Close-ticket form
  closeTicketModalHandler,
];
