import { createFileRoute } from "@tanstack/react-router";
import { Dashboard } from "@/components/doorstep/Dashboard";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Doorstep — knows where to look after a storm" },
      { name: "description", content: "One pre-storm text plus post-storm check-ins show coordinators exactly who needs help and where to look." },
      { property: "og:title", content: "Doorstep — knows where to look" },
      { property: "og:description", content: "See who is safe, who is silent, and where to look first after a storm." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});
