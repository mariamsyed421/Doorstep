import { createFileRoute } from "@tanstack/react-router";
import { Dashboard } from "@/components/doorstep/Dashboard";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Doorstep — Richardson catastrophe response map" },
      {
        name: "description",
        content:
          "A map-first catastrophe response demo for coordinators: prioritize Richardson neighborhoods, find silent households, and simulate neighbor check-ins.",
      },
      { property: "og:title", content: "Doorstep — Richardson catastrophe response map" },
      {
        property: "og:description",
        content:
          "Prioritize neighborhoods, check silent households, and coordinate help after the storm.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});
