import createTicketHandler, {
  closeTicketHandler,
  claimTicketHandler,
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
  createTicketHandler,

  // Normal Tickets panel
  normalTicketCreateButton,

  // Merch Tickets panel
  merchTicketCreateButton,

  // Existing ticket controls
  closeTicketHandler,
  claimTicketHandler,
  priorityTicketHandler,
  pinTicketHandler,
  unclaimTicketHandler,
  reopenTicketHandler,
  deleteTicketHandler,
];
