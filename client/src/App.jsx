import { Navigate, Route, Routes } from 'react-router-dom'
import LandingPage from './pages/LandingPage.jsx'
import LoginPage from './pages/LoginPage.jsx'
import Register from './pages/Register.jsx'
import OnboardingPage from './pages/OnboardingPage.jsx'
import InboxPage from './pages/InboxPage.jsx'
import InboxSearchPage from './pages/InboxSearchPage.jsx'
import InboxNewConversationPage from './pages/InboxNewConversationPage.jsx'
import ContactsPage from './pages/ContactsPage.jsx'
import OrgReportsPage from './pages/OrgReportsPage.jsx'
import TestSendMessagePage from './pages/TestSendMessagePage.jsx'
import PostAuthRedirect from './pages/PostAuthRedirect.jsx'
import OrgSelectorPage from './pages/OrgSelectorPage.jsx'
import InvitePage from './pages/InvitePage.jsx'
import OrgSettingsLayout from './pages/OrgSettingsLayout.jsx'
import OrgSettingsHomePage from './pages/OrgSettingsHomePage.jsx'
import OrgTeammatesPage from './pages/OrgTeammatesPage.jsx'
import OrgTeammatesSection from './pages/OrgTeammatesSection.jsx'
import OrgInviteTeammatesPage from './pages/OrgInviteTeammatesPage.jsx'
import OrgInviteTeammatePermissionsPage from './pages/OrgInviteTeammatePermissionsPage.jsx'
import OrgEditTeammatePermissionsPage from './pages/OrgEditTeammatePermissionsPage.jsx'
import OrgTeammateProfilePage from './pages/OrgTeammateProfilePage.jsx'
import OrgAiSettingsPage from './pages/OrgAiSettingsPage.jsx'
import OrgWorkflowSettingsPage from './pages/OrgWorkflowSettingsPage.jsx'
import OrgTagsSettingsPage from './pages/OrgTagsSettingsPage.jsx'
import OrgInboxesSettingsPage from './pages/OrgInboxesSettingsPage.jsx'
import OrgAssignmentSettingsPage from './pages/OrgAssignmentSettingsPage.jsx'
import OrgEmailSettingsPage from './pages/OrgEmailSettingsPage.jsx'
import OrgLifecycleSettingsPage from './pages/OrgLifecycleSettingsPage.jsx'
import OrgGeneralSettingsPage from './pages/OrgGeneralSettingsPage.jsx'
import OrgKnowledgeListPage from './pages/OrgKnowledgeListPage.jsx'
import OrgKnowledgeEditorPage from './pages/OrgKnowledgeEditorPage.jsx'
import TeammatesInviteDeepLink from './pages/TeammatesInviteDeepLink.jsx'
import { RequireAuth } from './components/ProtectedRoute.jsx'
import { OrgWorkspaceLayout } from './layouts/OrgWorkspaceLayout.jsx'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<Register />} />
      <Route path="/invite" element={<InvitePage />} />
      <Route path="/org/:orgId/test/send-message" element={<TestSendMessagePage />} />

      <Route element={<RequireAuth />}>
        <Route path="/continue" element={<PostAuthRedirect />} />
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route path="/select-org" element={<OrgSelectorPage />} />
        <Route path="/teammates/invite/new" element={<TeammatesInviteDeepLink />} />

        <Route path="/org/:orgId" element={<OrgWorkspaceLayout />}>
          <Route path="inbox" element={<InboxPage />} />
          <Route path="inbox/new-conversation" element={<InboxNewConversationPage />} />
          <Route path="contact" element={<ContactsPage />} />
          <Route path="knowledge" element={<OrgKnowledgeListPage />} />
          <Route path="knowledge/new" element={<OrgKnowledgeEditorPage />} />
          <Route path="knowledge/:articleId" element={<OrgKnowledgeEditorPage />} />
          <Route path="reports" element={<OrgReportsPage />} />
          <Route path="search" element={<InboxSearchPage />} />
          <Route path="admins/teammate/:teammateId" element={<OrgTeammateProfilePage />} />
          <Route path="settings" element={<OrgSettingsLayout />}>
            <Route index element={<OrgSettingsHomePage />} />
            <Route path="general" element={<OrgGeneralSettingsPage />} />
            <Route path="teammates" element={<OrgTeammatesSection />}>
              <Route index element={<OrgTeammatesPage />} />
              <Route path="invite/new" element={<OrgInviteTeammatesPage />} />
              <Route path="invite/new/permissions" element={<OrgInviteTeammatePermissionsPage />} />
              <Route path=":memberId/permissions" element={<OrgEditTeammatePermissionsPage />} />
            </Route>
            <Route path="ai" element={<OrgAiSettingsPage />} />
            <Route path="workflows" element={<OrgWorkflowSettingsPage />} />
            <Route path="tags" element={<OrgTagsSettingsPage />} />
            <Route path="inboxes" element={<OrgInboxesSettingsPage />} />
            <Route path="assignment" element={<OrgAssignmentSettingsPage />} />
            <Route path="email" element={<OrgEmailSettingsPage />} />
            <Route path="lifecycle" element={<OrgLifecycleSettingsPage />} />
          </Route>
        </Route>
      </Route>

      <Route path="/getting-started" element={<Navigate to="/onboarding" replace />} />
      <Route path="/dashboard" element={<Navigate to="/continue" replace />} />
      <Route path="/inbox" element={<Navigate to="/continue" replace />} />


      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
