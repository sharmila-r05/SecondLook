import type { MetadataRoute } from "next";

// Installable family screen: on iPhone, web push only works from a Home Screen app, so this is what makes Sarah's
// and Tom's alerts possible there.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/family",
    name: "Second Look",
    short_name: "Second Look",
    description: "Mom pays her own bills. The family gets a second look when something's off.",
    start_url: "/family",
    scope: "/",
    display: "standalone",
    background_color: "#3b1f3a",
    theme_color: "#3b1f3a",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
