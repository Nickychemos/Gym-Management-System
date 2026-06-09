import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import { Layout } from '@/components/layout/Layout'
import { ProtectedRoute } from '@/components/layout/ProtectedRoute'
import { RoleGuard } from '@/components/layout/RoleGuard'
import { AuthProvider } from '@/context/AuthContext'
import { ToastProvider } from '@/context/ToastContext'
import AcceptInvitePage from '@/pages/AcceptInvite'
import ClassesPage from '@/pages/classes/Classes'
import CoachingPage from '@/pages/coaching/Coaching'
import DietPlanBuilderPage from '@/pages/coaching/DietPlanBuilder'
import TrainingPlanBuilderPage from '@/pages/coaching/TrainingPlanBuilder'
import CompliancePage from '@/pages/compliance/Compliance'
import DashboardPage from '@/pages/Dashboard'
import EquipmentPage from '@/pages/equipment/Equipment'
import EquipmentDetailPage from '@/pages/equipment/EquipmentDetail'
import LoginPage from '@/pages/Login'
import MemberDetailPage from '@/pages/members/MemberDetail'
import MarketingPage from '@/pages/marketing/Marketing'
import MembersListPage from '@/pages/members/MembersList'
import PaymentsPage from '@/pages/payments/Payments'
import ProfilePage from '@/pages/profile/Profile'
import PtPackageDetailPage from '@/pages/pt/PtPackageDetail'
import PtPackagesPage from '@/pages/pt/PtPackages'
import RefundsPage from '@/pages/refunds/Refunds'
import SettingsPage from '@/pages/settings/Settings'
import SurveysPage from '@/pages/surveys/Surveys'
import SchedulePage from '@/pages/schedule/Schedule'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000,
      gcTime: 5 * 60 * 1000,
      refetchOnWindowFocus: true,
      retry: 1,
    },
  },
})

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      {/* basename matches the Frappe route (website_route_rules in hooks.py).
          Prod: served at /gym. Dev: visit http://localhost:5173/gym */}
      <BrowserRouter basename="/gym">
        <AuthProvider>
          <ToastProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/accept-invite" element={<AcceptInvitePage />} />

            <Route
              element={
                <ProtectedRoute>
                  <RoleGuard>
                    <Layout />
                  </RoleGuard>
                </ProtectedRoute>
              }
            >
              <Route index element={<DashboardPage />} />

              <Route path="members" element={<MembersListPage />} />
              <Route path="members/:id" element={<MemberDetailPage />} />
              <Route path="schedule" element={<SchedulePage />} />
              <Route path="classes" element={<ClassesPage />} />
              <Route path="pt" element={<PtPackagesPage />} />
              <Route path="pt/:id" element={<PtPackageDetailPage />} />
              <Route path="payments" element={<PaymentsPage />} />
              <Route path="refunds" element={<RefundsPage />} />
              <Route path="equipment" element={<EquipmentPage />} />
              <Route path="equipment/:id" element={<EquipmentDetailPage />} />
              <Route path="compliance" element={<CompliancePage />} />
              <Route path="marketing" element={<MarketingPage />} />
              <Route path="coaching" element={<CoachingPage />} />
              <Route path="coaching/diet/:id" element={<DietPlanBuilderPage />} />
              <Route path="coaching/training/:id" element={<TrainingPlanBuilderPage />} />
              <Route path="surveys" element={<SurveysPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="profile" element={<ProfilePage />} />

              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
          </ToastProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}

export default App
