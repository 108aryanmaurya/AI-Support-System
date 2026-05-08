/**
 * Monitoring placeholder hooks for future telemetry integration
 * (Datadog, Sentry breadcrumbs, OpenTelemetry, etc).
 */
export function emitIncomingMessageEvent(eventName, metadata = {}) {
  // eslint-disable-next-line no-console
  console.log(`[incoming_message] ${eventName}`, metadata);
}
