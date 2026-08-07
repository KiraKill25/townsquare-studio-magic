import { QueryClient } from "@tanstack/react-query";
import { createRouter, createHashHistory } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    // Hash history prevents 404 / white screen on offline Android WebView.
    // Only available in the browser — omit during SSR.
    ...(typeof window !== "undefined" ? { history: createHashHistory() } : {}),

    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
