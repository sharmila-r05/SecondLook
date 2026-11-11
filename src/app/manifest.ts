import type { MetadataRoute } from "next";

// Installable: on iPhone, web push only works from a Home Screen app, so this is what makes Sarah's and Tom's alerts
// possible there. The app opens through /open, which sends each device to its own person's screen (Mom's tablet to
// hers, Tom's phone to his). The id stays "/family" so an app already installed is the same app.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/family",
    name: "Second Look",
    short_name: "Second Look",
    description: "Mom pays her own bills. The family gets a second look when something’s off.",
    start_url: "/open",
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
