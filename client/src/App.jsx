import { Routes, Route } from "react-router-dom";
import CustomerNav from "./components/CustomerNav";
import AdminLayout from "./components/admin/AdminLayout";
import ProtectedRoute from "./auth/ProtectedRoute";
import { CartProvider } from "./cart/CartContext";
import Dashboard from "./pages/Dashboard";
import Inventory from "./pages/Inventory";
import Staff from "./pages/Staff";
import Order from "./pages/Order";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import MenuAdmin from "./pages/MenuAdmin";
import MyOrders from "./pages/MyOrders";
import Reports from "./pages/Reports";
import POS from "./pages/POS";
import Receipt from "./pages/Receipt";
import Orders from "./pages/Orders";
import Rider from "./pages/Rider";
import MealPlans from "./pages/MealPlans";

export default function App() {
  return (
    <Routes>
      {/* Customer storefront shell: warm retail look (CustomerNav + theme.css).
          Browsing the menu stays public; Order.jsx itself gates checkout on
          being logged in as a customer. */}
      <Route element={<CartProvider><CustomerNav /></CartProvider>}>
        <Route path="/order" element={<Order />} />
        <Route path="/meal-plans" element={<MealPlans />} />
        <Route
          path="/my-orders"
          element={
            <ProtectedRoute roles={["customer"]}>
              <MyOrders />
            </ProtectedRoute>
          }
        />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
      </Route>

      {/* Owner/staff backend shell: clean software look (AdminLayout + admin-theme.css) */}
      <Route
        element={
          <ProtectedRoute roles={["owner", "staff"]}>
            <AdminLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<Dashboard />} />
        <Route path="/pos" element={<POS />} />
        <Route path="/orders" element={<Orders />} />
        <Route path="/inventory" element={<Inventory />} />
        <Route path="/staff" element={<Staff />} />
        <Route
          path="/menu-admin"
          element={
            <ProtectedRoute roles={["owner"]}>
              <MenuAdmin />
            </ProtectedRoute>
          }
        />
        <Route
          path="/reports"
          element={
            <ProtectedRoute roles={["owner"]}>
              <Reports />
            </ProtectedRoute>
          }
        />
      </Route>

      {/* Rider shell: reuses AdminLayout (it swaps in a rider-only nav when the
          logged-in user's role is 'rider' — see AdminLayout.jsx) so a rider gets
          the same clean dashboard chrome without a third shell to maintain. */}
      <Route
        element={
          <ProtectedRoute roles={["rider"]}>
            <AdminLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/rider" element={<Rider />} />
      </Route>

      {/* Any logged-in role — the backend enforces a customer can only fetch their own
          order. Standalone (no shell chrome): it's a print-friendly receipt, and both
          nav shells are hidden on print anyway. */}
      <Route
        path="/receipt/:id"
        element={
          <ProtectedRoute>
            <Receipt />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}
