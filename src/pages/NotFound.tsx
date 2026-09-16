import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";
import { Home } from "lucide-react";
import { Button } from "@/components/ui/button";

const NotFound = () => {
  const location = useLocation();
  const { t } = useTranslation();

  useEffect(() => {
    console.error(
      "404 Error: User attempted to access non-existent route:",
      location.pathname
    );
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-app text-foreground">
      <div className="pointer-events-none fixed inset-0 bg-grid opacity-40" />
      <div className="relative z-10 text-center">
        <p className="font-display text-7xl font-bold text-gradient">404</p>
        <p className="mt-4 mb-6 text-muted-foreground">{t("notFound.title")}</p>
        <Button onClick={() => (window.location.href = "/")}>
          <Home className="h-4 w-4" />
          {t("notFound.actions.backHome")}
        </Button>
      </div>
    </div>
  );
};

export default NotFound;
