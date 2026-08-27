import { useState } from "react";
import { enablePush, disablePush, isPushEnabled } from "../push";

// Dropped into three different nav shells (admin sidebar, admin mobile panel,
// customer topbar/tabbar) — className carries each shell's own item styling
// so this never needs its own layout opinions.
export default function PushToggle({ className, iconClass = "ti-bell", showIcon = true }) {
  const [enabled, setEnabled] = useState(isPushEnabled);
  const [busy, setBusy] = useState(false);

  const handleClick = async () => {
    setBusy(true);
    if (enabled) {
      await disablePush();
      setEnabled(false);
    } else {
      const res = await enablePush();
      if (res.ok) {
        setEnabled(true);
      } else {
        alert(res.error);
      }
    }
    setBusy(false);
  };

  return (
    <button className={className} onClick={handleClick} disabled={busy} type="button">
      {showIcon && <i className={`ti ${enabled ? "ti-bell-ringing" : iconClass}`} aria-hidden="true" />}
      <span>{busy ? "…" : enabled ? "Notifications on" : "Enable notifications"}</span>
    </button>
  );
}
