import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import { MarketingHome } from "./components/MarketingHome";
import { PublicInfoPage } from "./components/PublicInfoPage";
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

function getPublicPage() {
  if (typeof window === "undefined") return null;

  const pathname = window.location.pathname.replace(/\/+$/, "") || "/";

  if (pathname === "/privacy") return "privacy" as const;
  if (pathname === "/terms") return "terms" as const;
  if (pathname === "/support") return "support" as const;

  return null;
}

const publicPage = getPublicPage();

createRoot(document.getElementById("root")!).render(
  shouldRenderApp() ? (
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  ) : publicPage ? (
    <PublicInfoPage page={publicPage} />
  ) : (
    <MarketingHome />
  ),
);
