import type { MetadataRoute } from "next";

/** Lets phones install Tinco to the home screen and open it full screen, like an app. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Tinco · Rental deposit escrow",
    short_name: "Tinco",
    description: "Rental deposits held by a smart contract on Avalanche, not in anyone's pocket.",
    start_url: "/",
    display: "standalone",
    background_color: "#0a0a0b",
    theme_color: "#0a0a0b",
    lang: "en",
    categories: ["finance", "lifestyle"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Find a room", url: "/rooms" },
      { name: "My leases", url: "/me" },
      { name: "Judge demo", url: "/demo" },
    ],
  };
}
