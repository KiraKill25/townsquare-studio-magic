import { QueryClient } from "@tanstack/react-query";
import { createRouter, createHashHistory } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    history: createHashHistory(), // Prevents 404 / white screen on offline Android WebView
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
