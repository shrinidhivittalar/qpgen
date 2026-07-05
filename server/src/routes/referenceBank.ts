import { Router } from 'express';
import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth.js';

const router = Router();

// Returns the teacher's saved reference banks.
// Stub: ReferenceBank model is not yet implemented — returns empty array.
// The client dropdown gracefully shows "None — use default style" when this is empty.
router.get('/', async (req: AuthRequest, res: Response) => {
  // TODO: When ReferenceBank model is added, query by req.userId and return
  // [{ id, name }] shaped objects matching the ReferenceBank client type.
  res.json([]);
});

export default router;
