import createTicketHandler, {
  closeTicketHandler,
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
} from '../../../tickets/normalTickets.js';

import {
  merchTicketCreateButton,
} from '../../../tickets/merchTickets.js';

export default [
  // Legacy ticket creation
  createTicketHandler,

  // Normal ticket creation
  normalTicketCreateButton,

  // Merch ticket creation
  merchTicketCreateButton,

  // Ticket controls
  closeTicketHandler,
  claimTicketHandler,

  // IMPORTANT:
  // This is the button that opens the priority menu.
  priorityMenuHandler,

  // This handles the actual priority selection.
  priorityTicketHandler,

  pinTicketHandler,
  unclaimTicketHandler,
  reopenTicketHandler,
  deleteTicketHandler,
];
