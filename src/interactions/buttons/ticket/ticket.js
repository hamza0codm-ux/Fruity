import createTicketHandler, {
  createTicketModalHandler,
  closeTicketHandler,
  closeTicketModalHandler,
  claimTicketHandler,
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
  // Legacy / normal ticket creation
  createTicketHandler,
  createTicketModalHandler,

  // Normal Tickets
  normalTicketCreateButton,
  normalTicketModal,

  // Merch Tickets
  merchTicketCreateButton,
  merchTicketModal,

  // Existing ticket controls
  closeTicketHandler,
  closeTicketModalHandler,
  claimTicketHandler,
  priorityTicketHandler,
  pinTicketHandler,
  unclaimTicketHandler,
  reopenTicketHandler,
  deleteTicketHandler,
];
