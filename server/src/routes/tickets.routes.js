import { Router } from 'express';
import * as ticketsController from '../controllers/tickets.controller.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.use(requireAuth);

router.get('/', ticketsController.listTickets);
router.get('/:id', ticketsController.getTicket);
router.post('/', ticketsController.createTicket);

export default router;
