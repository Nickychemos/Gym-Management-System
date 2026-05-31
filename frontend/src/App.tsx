import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import { Layout } from '@/components/layout/Layout'
import { ProtectedRoute } from '@/components/layout/ProtectedRoute'
import { AuthProvider } from '@/context/AuthContext'
import DashboardPage from '@/pages/Dashboard'
import LoginPage from '@/pages/Login'
import Placeholder from '@/pages/Placeholder'

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

              <Route
                path="members"
                element={<Placeholder title="Members" hint="Member list, search, filters. Week 2." />}
              />
              <Route
                path="members/:id"
                element={<Placeholder title="Member 360" hint="6-tab member detail view. Week 2." />}
              />
              <Route
                path="schedule"
                element={<Placeholder title="Schedule" hint="Weekly class grid. Week 3." />}
              />
              <Route
                path="classes"
                element={<Placeholder title="Classes" hint="Class type catalog. Week 3." />}
              />
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
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}

export default App
