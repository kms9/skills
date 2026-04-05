/* @vitest-environment jsdom */
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Route } from "../routes/cli/auth";

let searchMock: Record<string, unknown> = {};
const originalLocation = window.location;

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (config: { component: unknown }) => ({
    options: config,
    useSearch: () => searchMock,
  }),
}));

vi.mock("../lib/useAuthStatus", () => ({
  useAuthStatus: () => ({
    isAuthenticated: false,
    isLoading: false,
    me: null,
  }),
}));

vi.mock("../lib/site", () => ({
  getClawHubSiteUrl: () => "http://localhost:10091",
  normalizeClawHubSiteOrigin: () => "http://localhost:10091",
}));

vi.mock("../lib/apiClient", () => ({
  apiRequest: vi.fn(),
}));

function renderWithProviders(ui: ReactNode) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>,
  );
}

describe("/cli/auth route", () => {
  beforeEach(() => {
    searchMock = {
      redirect_uri: "http://127.0.0.1:4567/callback",
      state: "state-123",
    };
    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        ...originalLocation,
        assign: vi.fn(),
        pathname: "/cli/auth",
        search:
          "?redirect_uri=http%3A%2F%2F127.0.0.1%3A4567%2Fcallback&state=state-123",
      },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, "location", {
      configurable: true,
      value: originalLocation,
    });
  });

  it("redirects unauthenticated users to unified login page with redirect", () => {
    renderWithProviders(<Route.options.component />);
    fireEvent.click(
      screen.getByRole("button", { name: /continue to sign in/i }),
    );

    expect(window.location.assign).toHaveBeenCalledWith(
      "/auth/login?redirect=%2Fcli%2Fauth%3Fredirect_uri%3Dhttp%253A%252F%252F127.0.0.1%253A4567%252Fcallback%26state%3Dstate-123",
    );
  });
});
