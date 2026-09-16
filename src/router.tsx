import Landing from "./pages/Landing";
import Auth from "./pages/Auth";
import Home from "./pages/Home";
import Room from "./pages/Room";
import Profile from "./pages/Profile";
import NotFound from "./pages/NotFound";

export const routers = [
  {
    path: "/",
    name: "landing",
    element: <Landing />,
  },
  {
    path: "/auth",
    name: "auth",
    element: <Auth />,
  },
  {
    path: "/home",
    name: "home",
    element: <Home />,
  },
  {
    path: "/room/:code",
    name: "room",
    element: <Room />,
  },
  {
    path: "/profile",
    name: "profile",
    element: <Profile />,
  },
  /* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */
  {
    path: "*",
    name: "404",
    element: <NotFound />,
  },
];

declare global {
  interface Window {
    __routers__: typeof routers;
  }
}

window.__routers__ = routers;
