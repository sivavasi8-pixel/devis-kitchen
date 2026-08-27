import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import NotificationBell from "../NotificationBell";
import PushToggle from "../PushToggle";

// Owner-only items are filtered in at render time (see navItems below) —
// staff never sees Menu/Reports, matching the real role gate on those routes.
// Rider gets its own single-item nav (no dashboard/POS/etc — see riderNavItems).
const allNavItems = [
  { to: "/", label: "Dashboard", icon: "ti-layout-dashboard", end: true },
  { to: "/pos", label: "POS", icon: "ti-cash-register" },
  { to: "/orders", label: "Orders", icon: "ti-clipboard-list" },
  { to: "/inventory", label: "Inventory", icon: "ti-package" },
  { to: "/staff", label: "Staff", icon: "ti-users" },
  { to: "/menu-admin", label: "Menu", icon: "ti-tools-kitchen-2", ownerOnly: true },
  { to: "/reports", label: "Reports", icon: "ti-chart-bar", ownerOnly: true }
];

const riderNavItems = [{ to: "/rider", label: "My Deliveries", icon: "ti-moped", end: true }];

// Owner/staff/rider each have their own standalone manual (client/public/handbook-*.html) —
// no shared page, so this just maps role straight to its file.
const handbookHrefFor = (role) => `/handbook-${["owner", "staff", "rider"].includes(role) ? role : "owner"}.html`;

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const isRider = user?.role === "rider";
  const navItems = isRider ? riderNavItems : allNavItems.filter((n) => !n.ownerOnly || user?.role === "owner");
  // Each role gets its own standalone manual, not a shared page — see handbookHrefFor below.
  const handbookHref = handbookHrefFor(user?.role);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <div className="admin-root admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-sidebar-brand">
          <div className="admin-sidebar-badge">D</div>
          <div>
            <p className="admin-sidebar-name">Devi's Kitchen</p>
            <p className="admin-sidebar-sub">{isRider ? "Rider console" : "Owner console"}</p>
          </div>
        </div>

        {navItems.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            className={({ isActive }) => `admin-nav-item${isActive ? " active" : ""}`}
          >
            <i className={`ti ${n.icon}`} aria-hidden="true" />
            <span>{n.label}</span>
          </NavLink>
        ))}

        <div className="admin-sidebar-footer">
          <a href={handbookHref} target="_blank" rel="noopener noreferrer" className="admin-nav-item">
            <i className="ti ti-book" aria-hidden="true" />
            <span>Guide</span>
          </a>
          <PushToggle className="admin-nav-item" />
          <div className="admin-sidebar-bell">
            <NotificationBell align="left" openUpward />
          </div>
          <div className="admin-sidebar-user">
            {user?.name} <span>{user?.email}</span>
          </div>
          <button className="admin-nav-item admin-logout" onClick={handleLogout}>
            <i className="ti ti-logout" aria-hidden="true" />
            <span>Log out</span>
          </button>
        </div>
      </aside>

      <div className="admin-main">
        <MobileTopbar navItems={navItems} onLogout={handleLogout} />
        <Outlet />
        <MobileTabbar navItems={navItems} />
      </div>

      <style>{`
        .admin-shell { display: flex; min-height: 100vh; }

        .admin-sidebar {
          width: var(--a-sidebar-w); background: var(--a-sidebar); color: #cfd9d3;
          flex-shrink: 0; padding: 16px 10px; display: none; flex-direction: column;
          position: fixed; top: 0; left: 0; height: 100vh; z-index: 25;
        }
        @media (min-width: 900px) { .admin-sidebar { display: flex; } }

        .admin-sidebar-brand { display: flex; align-items: center; gap: 10px; padding: 4px 8px 20px; }
        .admin-sidebar-badge {
          width: 30px; height: 30px; border-radius: 50%; border: 1.5px solid var(--a-accent);
          display: flex; align-items: center; justify-content: center;
          font-family: var(--font-display); font-size: 12px; color: #fff; flex-shrink: 0;
        }
        .admin-sidebar-name { margin: 0; font-family: var(--font-display); font-size: 14px; color: #fff; line-height: 1.1; }
        .admin-sidebar-sub { margin: 0; font-size: 9px; color: #7f8c85; }

        .admin-nav-item {
          display: flex; align-items: center; gap: 10px; padding: 9px 10px; border-radius: 6px;
          font-size: 13px; color: #b7c2bc; text-decoration: none; background: none; border: none;
          width: 100%; text-align: left; box-sizing: border-box;
        }
        .admin-nav-item i { font-size: 16px; width: 16px; }
        .admin-nav-item:hover { background: var(--a-sidebar-hover); }
        .admin-nav-item.active { background: var(--a-sidebar-active); color: #fff; }
        .admin-logout { cursor: pointer; }

        .admin-sidebar-footer { margin-top: auto; padding-top: 12px; border-top: 1px solid #2a3a32; }
        .admin-sidebar-bell { padding: 2px 10px 8px; }
        .admin-sidebar-user { font-size: 12px; color: #b7c2bc; padding: 6px 10px; overflow-wrap: anywhere; }
        .admin-sidebar-user span { display: block; color: #7f8c85; font-size: 11px; }

        .admin-main { flex: 1; min-width: 0; }
        @media (min-width: 900px) { .admin-main { margin-left: var(--a-sidebar-w); } }
      `}</style>
    </div>
  );
}

function MobileTopbar({ navItems, onLogout }) {
  const [open, setOpen] = useState(false);
  const { user } = useAuth();

  return (
    <div className="admin-mobile-topbar-wrap">
      <div className="admin-mobile-topbar">
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div className="admin-sidebar-badge" style={{ width: 26, height: 26, fontSize: 11 }}>D</div>
          <span style={{ fontFamily: "var(--font-display)", fontSize: 14 }}>Devi's Kitchen</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <NotificationBell />
          <button
            className="admin-mobile-menu-btn"
            onClick={() => setOpen((o) => !o)}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
          >
            <i className={`ti ${open ? "ti-x" : "ti-menu-2"}`} aria-hidden="true" />
          </button>
        </div>
      </div>

      {open && (
        <div className="admin-mobile-panel">
          {navItems.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) => `admin-nav-item${isActive ? " active" : ""}`}
              onClick={() => setOpen(false)}
            >
              <i className={`ti ${n.icon}`} aria-hidden="true" />
              <span>{n.label}</span>
            </NavLink>
          ))}
          <a href={handbookHrefFor(user?.role)} target="_blank" rel="noopener noreferrer" className="admin-nav-item">
            <i className="ti ti-book" aria-hidden="true" />
            <span>Guide</span>
          </a>
          <PushToggle className="admin-nav-item" />
          <div className="admin-sidebar-user" style={{ color: "#4d5852" }}>
            {user?.name} <span style={{ color: "#8b9490" }}>{user?.email}</span>
          </div>
          <button className="admin-nav-item admin-logout" style={{ color: "var(--a-danger-text)" }} onClick={onLogout}>
            <i className="ti ti-logout" aria-hidden="true" />
            <span>Log out</span>
          </button>
        </div>
      )}

      <style>{`
        .admin-mobile-topbar {
          display: flex; background: var(--a-sidebar); color: #fff; height: var(--a-topbar-h);
          align-items: center; justify-content: space-between; padding: 0 12px;
          position: sticky; top: 0; z-index: 30;
        }
        .admin-mobile-menu-btn {
          border: none; background: none; color: #fff; font-size: 20px; padding: 4px; display: flex;
        }
        .admin-mobile-panel {
          background: var(--a-sidebar); padding: 6px 10px 14px; position: sticky; top: var(--a-topbar-h); z-index: 29;
        }
        .admin-mobile-panel .admin-sidebar-user { color: #b7c2bc; }
        @media (min-width: 900px) { .admin-mobile-topbar-wrap { display: none; } }
      `}</style>
    </div>
  );
}

function MobileTabbar({ navItems }) {
  return (
    <nav className="admin-mobile-tabbar" aria-label="Admin sections">
      {navItems.map((n) => (
        <NavLink
          key={n.to}
          to={n.to}
          end={n.end}
          className={({ isActive }) => `admin-mobile-tab${isActive ? " active" : ""}`}
        >
          <i className={`ti ${n.icon}`} aria-hidden="true" />
          <span>{n.label}</span>
        </NavLink>
      ))}
      <style>{`
        .admin-mobile-tabbar {
          display: flex; position: fixed; bottom: 0; left: 0; right: 0; height: var(--a-tabbar-h);
          background: var(--a-panel); border-top: 1px solid var(--a-border); z-index: 30;
          overflow-x: auto;
        }
        @media (min-width: 900px) { .admin-mobile-tabbar { display: none; } }
        .admin-mobile-tab {
          flex: 0 0 auto; min-width: 68px; display: flex; flex-direction: column;
          align-items: center; justify-content: center; gap: 2px; font-size: 10px;
          color: var(--a-text-muted); padding: 0 10px; text-decoration: none;
        }
        .admin-mobile-tab.active { color: var(--a-green); }
        .admin-mobile-tab i { font-size: 18px; }
      `}</style>
    </nav>
  );
}
