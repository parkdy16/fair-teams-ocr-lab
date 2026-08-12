import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import { MarketingHome } from "./components/MarketingHome";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 0 },
  },
});

function shouldRenderApp() {
  if (typeof window === "undefined") return false;

  const url = new URL(window.location.href);
  const pathname = url.pathname.replace(/\/+$/, "") || "/";
  const standalone =
    window.matchMedia?.("(display-mode: standalone)").matches ||
    Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);

  const legacyAppEntry =
    url.searchParams.get("source") === "pwa" ||
    url.searchParams.get("tour") === "1" ||
    url.searchParams.has("app");

  return pathname === "/app" || pathname.startsWith("/app/") || standalone || legacyAppEntry;
}

createRoot(document.getElementById("root")!).render(
  shouldRenderApp() ? (
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  ) : (
    <MarketingHome />
  ),
);
