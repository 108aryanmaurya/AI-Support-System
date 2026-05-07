import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { createOrGetCustomer } from '../controllers/customers.controller.js';

const router = Router();

router.use(requireAuth);
router.post('/', createOrGetCustomer);

export default router;
