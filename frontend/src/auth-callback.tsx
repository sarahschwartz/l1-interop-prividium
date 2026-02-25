import { useEffect, useState } from "react";
import React from "react";
import ReactDOM from "react-dom/client";
import { handleAuthCallback } from "prividium";

export function AuthCallback() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    handleAuthCallback((err) => {
      console.error("Auth callback error:", err);
      if (err) {
        setError(err);
      }
    });
  }, []);

  return (
    <div style={{ padding: "2rem", fontFamily: "sans-serif" }}>
      {error ? (
        <div
          style={{
            background: "#fee2e2",
            color: "#991b1b",
            padding: "1rem",
            borderRadius: "8px",
          }}
        >
          {error}
        </div>
      ) : (
        <p>Completing sign-in...</p>
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AuthCallback />
  </React.StrictMode>
);
