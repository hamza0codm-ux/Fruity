import {
  createTicketModalHandler,
  closeTicketModalHandler,
  priorityModalTicketHandler,
} from '../../../handlers/ticketButtons.js';


export default [
  /*
   * Generic ticket creation modal
   */
  createTicketModalHandler,

  /*
   * Close form
   */
  closeTicketModalHandler,

  /*
   * Priority form
   */
  priorityModalTicketHandler,
];
