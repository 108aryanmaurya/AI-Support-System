import { widgetConfig } from '../config/widget.config.js';
import { HttpError } from '../utils/httpError.js';
import { getWidgetInstallationByKey } from '../services/widget/widgetInstallation.service.js';
import { getInstallationSigningSecret } from '../services/widget/widgetIdentify.service.js';
import { signWidgetUserJwt } from '../utils/widgetUserJwt.js';

const isProduction = (process.env.NODE_ENV ?? 'development') === 'production';

/**
 * Dev-only: sign a user JWT for local test sites. Never enable in production.
 */
export async function widgetDevSignUserJwtController(req, res, next) {
  try {
    if (isProduction || !widgetConfig.devAllowInsecureIdentify) {
      throw new HttpError(404, 'Not found.');
    }

    const widgetKey = typeof req.body?.widget_key === 'string' ? req.body.widget_key.trim() : '';
    const userId = typeof req.body?.userId === 'string' ? req.body.userId.trim() : '';
    const email = typeof req.body?.email === 'string' ? req.body.email : undefined;
    const name = typeof req.body?.name === 'string' ? req.body.name : undefined;

    if (!widgetKey) throw new HttpError(400, 'widget_key is required.');
    if (!userId) throw new HttpError(400, 'userId is required.');

    const installation = await getWidgetInstallationByKey(widgetKey);
    if (!installation || installation.status !== 'active') {
      throw new HttpError(404, 'Widget not found.');
    }

    const secret = getInstallationSigningSecret(installation);
    if (!secret) {
      throw new HttpError(
        503,
        'Installation has no encrypted secret. Recreate installation with SECRETS_ENCRYPTION_KEY set.',
      );
    }

    const userJwt = signWidgetUserJwt({ userId, email, name }, secret);
    res.json({
      userJwt,
      expiresInSec: widgetConfig.userJwtDefaultTtlSec,
      hint: 'Pass to SupportWidget.boot({ userJwt }) or identify({ userJwt }). Dev only.',
    });
  } catch (err) {
    next(err);
  }
}
