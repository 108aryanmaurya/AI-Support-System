import { Router } from 'express';
import { createOrGetCustomer, listCustomersController } from '../controllers/customers.controller.js';

const router = Router({ mergeParams: true });

router.get('/', listCustomersController);
router.post('/', createOrGetCustomer);

export default router;
