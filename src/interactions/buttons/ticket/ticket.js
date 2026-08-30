import createTicketHandler, {
  createTicketModalHandler,
  closeTicketHandler,
  closeTicketModalHandler,
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
  normalTicketModal,
} from '../../../tickets/normalTickets.js';

import {
  merchTicketCreateButton,
  merchTicketModal,
} from '../../../tickets/merchTickets.js';

export default [
  // Legacy ticket system
  createTicketHandler,

  // Normal tickets
  normalTicketCreateButton,

  // Merch tickets
  merchTicketCreateButton,

  // Ticket controls
  closeTicketHandler,
  claimTicketHandler,
  priorityMenuHandler,
  priorityTicketHandler,
  pinTicketHandler,
  unclaimTicketHandler,
  reopenTicketHandler,
  deleteTicketHandler,
];
