import { listOrgAuditEvents } from '../services/analytics/auditEvents.service.js';

export async function listOrgAuditEventsController(req, res, next) {
  try {
    const data = await listOrgAuditEvents(req.organizationId, req.query);
    res.json(data);
  } catch (e) {
    next(e);
  }
}
