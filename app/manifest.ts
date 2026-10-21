import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Batwara",
    short_name: "Batwara",
    description: "Split expenses with friends",
    id: "/",
    start_url: "/",
    scope: "/",
    orientation: "portrait",
    display: "standalone",
    background_color: "#021f17",
    theme_color: "#04382b",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
