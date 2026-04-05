import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { getClawHubSiteUrl, normalizeClawHubSiteOrigin } from "../../lib/site";
import { useAuthStatus } from "../../lib/useAuthStatus";
import { apiRequest } from "../../lib/apiClient";

export const Route = createFileRoute("/cli/auth")({
  component: CliAuth,
});

function CliAuth() {
  const { isAuthenticated, isLoading, me } = useAuthStatus();

  const search = Route.useSearch() as {
    redirect_uri?: string;
    label?: string;
    label_b64?: string;
    state?: string;
  };
  const [status, setStatus] = useState<string>("Preparing...");
  const hasRun = useRef(false);

  const redirectUri = search.redirect_uri ?? "";
  const label =
    (decodeLabel(search.label_b64) ?? search.label ?? "CLI token").trim() ||
    "CLI token";
  const state = typeof search.state === "string" ? search.state.trim() : "";
  const currentPath =
    typeof window !== "undefined"
      ? `${window.location.pathname}${window.location.search}`
      : "/cli/auth";

  const safeRedirect = useMemo(
    () => isAllowedRedirectUri(redirectUri),
    [redirectUri],
  );
  const registry = useMemo(() => {
    if (typeof window !== "undefined") {
      return (
        normalizeClawHubSiteOrigin(window.location.origin) ??
        getClawHubSiteUrl()
      );
    }
    return getClawHubSiteUrl();
  }, []);

  useEffect(() => {
    if (hasRun.current) return;
    if (!safeRedirect) return;
    if (!state) return;
    if (!isAuthenticated || !me) return;
    hasRun.current = true;

    setStatus("Creating CLI token...");

    apiRequest<{ token: string }>("/users/me/tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label }),
    })
      .then(({ token }) => {
        const callbackUrl = new URL(redirectUri);
        callbackUrl.searchParams.set("token", token);
        callbackUrl.searchParams.set("state", state);
        callbackUrl.searchParams.set("registry", registry);
        setStatus("Token created! Redirecting to CLI...");
        window.location.assign(callbackUrl.toString());
      })
      .catch(() => {
        setStatus("Failed to create token. Please try again.");
        hasRun.current = false;
      });
  }, [
    isAuthenticated,
    me,
    safeRedirect,
    state,
    redirectUri,
    label,
    state,
    registry,
  ]);

  if (!safeRedirect) {
    return (
      <main className="section">
        <div className="card">
          <h1 className="section-title" style={{ marginTop: 0 }}>
            CLI login
          </h1>
          <p className="section-subtitle">Invalid redirect URL.</p>
          <p className="section-subtitle" style={{ marginBottom: 0 }}>
            Run the CLI again to start a fresh login.
          </p>
        </div>
      </main>
    );
  }

  if (!state) {
    return (
      <main className="section">
        <div className="card">
          <h1 className="section-title" style={{ marginTop: 0 }}>
            CLI login
          </h1>
          <p className="section-subtitle">Missing state.</p>
          <p className="section-subtitle" style={{ marginBottom: 0 }}>
            Run the CLI again to start a fresh login.
          </p>
        </div>
      </main>
    );
  }

  if (!isAuthenticated || !me) {
    return (
      <main className="section">
        <div className="card">
          <h1 className="section-title" style={{ marginTop: 0 }}>
            CLI login
          </h1>
          <p className="section-subtitle">
            Sign in to create an API token for the CLI.
          </p>
          <button
            className="btn btn-primary"
            type="button"
            disabled={isLoading}
            onClick={() => {
              window.location.assign(
                `/auth/login?redirect=${encodeURIComponent(currentPath)}`,
              );
            }}
          >
            Continue to sign in
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="section">
      <div className="card">
        <h1 className="section-title" style={{ marginTop: 0 }}>
          CLI login
        </h1>
        <p className="section-subtitle">{status}</p>
      </div>
    </main>
  );
}

function isAllowedRedirectUri(value: string) {
  if (!value) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "http:") return false;
  const host = url.hostname.toLowerCase();
  return (
    host === "127.0.0.1" ||
    host === "localhost" ||
    host === "::1" ||
    host === "[::1]"
  );
}

function decodeLabel(value: string | undefined) {
  if (!value) return null;
  try {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    const decoded = new TextDecoder().decode(bytes);
    const label = decoded.trim();
    if (!label) return null;
    return label.slice(0, 80);
  } catch {
    return null;
  }
}
