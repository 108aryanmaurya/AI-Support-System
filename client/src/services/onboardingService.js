import { apiFetch } from './api.js'

export async function completeOnboarding(data) {
  return apiFetch('/api/onboarding/complete', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}
