import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import { AuthProvider } from "./auth/AuthContext.jsx";
import "./styles/theme.css";
import "./styles/admin-theme.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);

// Registers the (deliberately no-cache) service worker so the browser treats
// this as an installable app. Only in production — during `vite dev` this
// would otherwise fight Vite's own module reloading.
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Installability is a nice-to-have, not a requirement — a failed
      // registration (e.g. an unsupported browser) shouldn't be user-facing.
    });
  });
}
