import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import RootLayout from "./components/layout/RootLayout";
import ProtectedRoute from "./components/auth/ProtectedRoute";
import HomePage from "./pages/HomePage";
import SearchPage from "./pages/SearchPage";
import ProviderPage from "./pages/ProviderPage";
import FormalizationPage from "./pages/FormalizationPage";
import { NewRequestPage, RequestDetailPage, RequestsPage } from "./pages/RequestPages";
import { SecurityPage, TrustPage } from "./pages/AccountPages";
import EditPublicProfilePage from "./pages/EditPublicProfilePage";
import AdminReportsPage from "./pages/AdminReportsPage";
import AdminThreadEventsPage from "./pages/AdminThreadEventsPage";
import UnavailablePage from "./pages/UnavailablePage";
import ChatPage from "./pages/ChatPage";
import MyProfileDashboardPage from "./pages/MyProfileDashboardPage";
import { ManageOffersPage, OfferDetailPage, OfferEditorPage } from "./pages/OfferPages";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import DemoProfileSwitcher from "./components/dev/DemoProfileSwitcher";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Auth routes - no layout */}
        <Route path="/auth/login" element={<LoginPage />} />
        <Route path="/auth/register" element={<RegisterPage />} />

        {/* All routes wrapped in single RootLayout */}
        <Route element={<RootLayout />}>
          {/* Public routes */}
          <Route path="/" element={<HomePage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/buscar" element={<Navigate to="/search" replace />} />
          <Route path="/providers/:providerId" element={<ProviderPage />} />
          <Route path="/providers/:providerId/products/:productId" element={<OfferDetailPage />} />
          <Route path="/proveedor/:id" element={<ProviderPage />} />
          <Route path="/trust" element={<TrustPage />} />
          <Route path="/serialization" element={<UnavailablePage />} />

          {/* Protected: /requests and sub-routes */}
          <Route
            path="/requests"
            element={
              <ProtectedRoute>
                <RequestsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/requests/sent"
            element={
              <ProtectedRoute>
                <RequestsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/requests/received"
            element={
              <ProtectedRoute>
                <RequestsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/requests/new"
            element={
              <ProtectedRoute>
                <NewRequestPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/requests/:requestId"
            element={
              <ProtectedRoute>
                <RequestDetailPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/requests/:requestId/chat"
            element={
              <ProtectedRoute>
                <ChatPage />
              </ProtectedRoute>
            }
          />

          {/* Legacy roadmap-only route: not part of primary MVP navigation */}
          <Route
            path="/formalization"
            element={
              <ProtectedRoute>
                <FormalizationPage />
              </ProtectedRoute>
            }
          />

          {/* Protected: /me and sub-routes */}
          <Route
            path="/me"
            element={
              <ProtectedRoute>
                <MyProfileDashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile/me"
            element={
              <ProtectedRoute>
                <MyProfileDashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/provider/me"
            element={
              <ProtectedRoute>
                <MyProfileDashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/provider/create"
            element={
              <ProtectedRoute>
                <MyProfileDashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/me/profile/edit"
            element={
              <ProtectedRoute>
                <EditPublicProfilePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/me/products"
            element={
              <ProtectedRoute>
                <ManageOffersPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/me/products/new"
            element={
              <ProtectedRoute>
                <OfferEditorPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/me/products/:productId/edit"
            element={
              <ProtectedRoute>
                <OfferEditorPage />
              </ProtectedRoute>
            }
          />

          {/* Protected: /settings */}
          <Route
            path="/settings/security"
            element={
              <ProtectedRoute>
                <SecurityPage />
              </ProtectedRoute>
            }
          />

          {/* Protected: /admin - ADMIN only */}
          <Route
            path="/admin/reports"
            element={
              <ProtectedRoute allowedRoles={["ADMIN", "ADMIN_REVIEWER", "SUPER_ADMIN"]}>
                <AdminReportsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/risk-reports"
            element={
              <ProtectedRoute allowedRoles={["ADMIN", "ADMIN_REVIEWER", "SUPER_ADMIN"]}>
                <AdminReportsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/threads/:id/events"
            element={
              <ProtectedRoute allowedRoles={["ADMIN", "ADMIN_REVIEWER", "SUPER_ADMIN"]}>
                <AdminThreadEventsPage />
              </ProtectedRoute>
            }
          />

          {/* Redirects */}
          <Route path="/dashboard/perfil" element={<Navigate to="/me" replace />} />
          <Route path="/dashboard/cotizaciones" element={<Navigate to="/requests" replace />} />
          <Route path="/dashboard/formalizacion" element={<Navigate to="/me" replace />} />

          {/* 404 */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      <DemoProfileSwitcher />
    </BrowserRouter>
  );
}
