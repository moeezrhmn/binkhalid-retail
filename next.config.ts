import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Product images are limited to 2 MB; the extra room covers the rest of the form.
    serverActions: { bodySizeLimit: "3mb" },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
