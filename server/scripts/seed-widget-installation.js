/**
 * Dev helper: create a widget installation for an org.
 * Usage: node server/scripts/seed-widget-installation.js <organizationId>
 */
import 'dotenv/config';
import { createWidgetInstallation } from '../src/services/widget/widgetInstallation.service.js';

const orgId = process.argv[2]?.trim();
if (!orgId) {
  console.error('Usage: node server/scripts/seed-widget-installation.js <organizationId>');
  process.exit(1);
}

const { installation, secret } = await createWidgetInstallation({
  organizationId: orgId,
  allowedDomains: ['localhost', '127.0.0.1'],
  settings: {
    requireEmail: true,
    greeting: 'Hi! How can we help you today?',
    showConversationList: true,
    identifyAllowInsecure: true,
  },
  testMode: true,
});

console.log('\nWidget installation created:\n');
console.log('  widget_key:', installation.widget_key);
console.log('  secret (save once):', secret);
console.log('\nPaste widget_key into messenger-web/test-site (port 5180)\n');
