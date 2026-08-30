import {
    closeTicketHandler,
    claimTicketHandler,

    priorityMenuTicketHandler,

    pinTicketHandler,
    unclaimTicketHandler,
    reopenTicketHandler,
    deleteTicketHandler,
} from '../../../handlers/ticketButtons.js';


export default [
    // ==========================================
    // CLOSE
    // ==========================================

    closeTicketHandler,


    // ==========================================
    // CLAIM
    // ==========================================

    claimTicketHandler,


    // ==========================================
    // PRIORITY
    // ==========================================

    priorityMenuTicketHandler,


    // ==========================================
    // OTHER TICKET CONTROLS
    // ==========================================

    pinTicketHandler,
    unclaimTicketHandler,
    reopenTicketHandler,
    deleteTicketHandler,
];
