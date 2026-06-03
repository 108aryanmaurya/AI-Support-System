import { resolveWidgetSessionFromToken } from '../services/widget/widgetSession.service.js';

export async function requireWidgetSession(req, res, next) {
  try {
    const auth = req.headers.authorization;
    const resolved = await resolveWidgetSessionFromToken(auth);
    req.widgetClaims = resolved.claims;
    req.widgetSession = resolved.session;
    req.widgetVisitor = resolved.visitor;
    req.widgetInstallation = resolved.installation;
    next();
  } catch (err) {
    next(err);
  }
}
