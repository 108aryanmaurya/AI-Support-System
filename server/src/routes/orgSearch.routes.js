import { Router } from 'express';
import {
  advancedSearchController,
  searchWorkspaceController,
} from '../controllers/search.controller.js';

const router = Router({ mergeParams: true });

router.get('/', searchWorkspaceController);
router.post('/advanced', advancedSearchController);

export default router;
