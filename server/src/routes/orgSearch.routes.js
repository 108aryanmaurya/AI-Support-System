import { Router } from 'express';
import { searchWorkspaceController } from '../controllers/search.controller.js';

const router = Router({ mergeParams: true });

router.get('/', searchWorkspaceController);

export default router;
