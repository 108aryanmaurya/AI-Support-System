import { Router } from 'express';
import { createOrGetCustomer } from '../controllers/customers.controller.js';

const router = Router({ mergeParams: true });

router.post('/', createOrGetCustomer);

export default router;
