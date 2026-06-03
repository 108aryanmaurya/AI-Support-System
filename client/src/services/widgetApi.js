import { apiFetch } from './api.js';

export function fetchWidgetInstallations(orgId) {
  return apiFetch(`/api/org/${orgId}/widget/installations`);
}

export function createWidgetInstallation(orgId, body) {
  return apiFetch(`/api/org/${orgId}/widget/installations`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function patchWidgetInstallation(orgId, installationId, body) {
  return apiFetch(`/api/org/${orgId}/widget/installations/${installationId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function rotateWidgetSecret(orgId, installationId) {
  return apiFetch(`/api/org/${orgId}/widget/installations/${installationId}/rotate-secret`, {
    method: 'POST',
    body: JSON.stringify({ revokeSessions: true }),
  });
}

export function fetchWidgetSnippet(orgId, installationId) {
  return apiFetch(`/api/org/${orgId}/widget/installations/${installationId}/snippet`);
}
