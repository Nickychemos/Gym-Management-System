import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import { Layout } from '@/components/layout/Layout'
import { ProtectedRoute } from '@/components/layout/ProtectedRoute'
import { AuthProvider } from '@/context/AuthContext'
import { ToastProvider } from '@/context/ToastContext'
import ClassesPage from '@/pages/classes/Classes'
import DashboardPage from '@/pages/Dashboard'
import LoginPage from '@/pages/Login'
import MemberDetailPage from '@/pages/members/MemberDetail'
import MembersListPage from '@/pages/members/MembersList'
import Placeholder from '@/pages/Placeholder'
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

            <Route
              element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }
            >
              <Route index element={<DashboardPage />} />

              <Route path="members" element={<MembersListPage />} />
              <Route path="members/:id" element={<MemberDetailPage />} />
              <Route path="schedule" element={<SchedulePage />} />
              <Route path="classes" element={<ClassesPage />} />
              <Route
                path="pt"
                element={<Placeholder title="PT Packages" hint="Package list + sell flow. Week 6." />}
              />
              <Route
                path="payments"
                element={<Placeholder title="Payments" hint="M-Pesa stream + recording. Week 4." />}
              />
              <Route
                path="equipment"
                element={<Placeholder title="Equipment" hint="Maintenance dashboard. Week 7." />}
              />
              <Route
                path="compliance"
                element={<Placeholder title="Compliance" hint="Renewals + certifications. Week 7." />}
              />
              <Route
                path="marketing"
                element={<Placeholder title="Marketing" hint="Campaigns + WhatsApp templates + chatbot. Weeks 8-9." />}
              />
              <Route
                path="coaching"
                element={<Placeholder title="Coaching" hint="Diet + training plan builders. Weeks 10-12." />}
              />
              <Route
                path="surveys"
                element={<Placeholder title="Surveys & NPS" hint="Templates + live NPS dashboard. Week 13." />}
              />
              <Route
                path="settings"
                element={<Placeholder title="Settings" hint="Gym + brand + plans + users + integrations. Week 14." />}
              />

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
