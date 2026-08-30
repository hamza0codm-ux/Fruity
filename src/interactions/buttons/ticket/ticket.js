import createTicketHandler, {
  closeTicketHandler,
  claimTicketHandler,

  priorityMenuTicketHandler,
  priorityModalTicketHandler,
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
  /*
   * Generic ticket creation
   */
  createTicketHandler,

  /*
   * Normal Tickets
   */
  normalTicketCreateButton,

  /*
   * Merch Tickets
   */
  merchTicketCreateButton,

  /*
   * Existing ticket controls
   */
  closeTicketHandler,
  claimTicketHandler,

  /*
   * NEW:
   * Normal + Merch tickets use
   * ticket_priority_menu.
   */
  priorityMenuTicketHandler,

  /*
   * Existing direct priority buttons
   * such as ticket_priority:high.
   */
  priorityTicketHandler,

  pinTicketHandler,
  unclaimTicketHandler,
  reopenTicketHandler,
  deleteTicketHandler,
];
