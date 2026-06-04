/**
 * Sign a widget user JWT for local testing (Intercom-style identify).
 *
 * Usage:
 *   node server/scripts/sign-widget-user-jwt.js <widget_key> <userId> [email] [name]
 *
 * Requires SECRETS_ENCRYPTION_KEY and an installation with secret_encrypted.
 */
import 'dotenv/config';
import { getWidgetInstallationByKey } from '../src/services/widget/widgetInstallation.service.js';
import { getInstallationSigningSecret } from '../src/services/widget/widgetIdentify.service.js';
import { signWidgetUserJwt } from '../src/utils/widgetUserJwt.js';

const widgetKey = process.argv[2]?.trim();
const userId = process.argv[3]?.trim();
const email = process.argv[4]?.trim() || null;
const name = process.argv[5]?.trim() || null;

if (!widgetKey || !userId) {
  console.error(
    'Usage: node server/scripts/sign-widget-user-jwt.js <widget_key> <userId> [email] [name]',
  );
  process.exit(1);
}

const installation = await getWidgetInstallationByKey(widgetKey);
if (!installation) {
  console.error('Widget installation not found for key:', widgetKey);
  process.exit(1);
}

const secret = getInstallationSigningSecret(installation);
if (!secret) {
  console.error(
    'No encrypted secret on installation. Set SECRETS_ENCRYPTION_KEY and recreate the installation.',
  );
  process.exit(1);
}

const userJwt = signWidgetUserJwt({ userId, email, name }, secret);
console.log('\nuserJwt (pass to SupportWidget.boot / identify):\n');
console.log(userJwt);
console.log('');
