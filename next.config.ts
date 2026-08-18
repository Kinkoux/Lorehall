import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Character portraits still post their bytes through a server action, and
    // the default limit is 1 MB. 5mb = 4 MB portrait cap + multipart overhead
    // headroom. Maps no longer figure into this: they go from the browser
    // straight to Storage over a signed upload URL, so only their key travels
    // through an action.
    serverActions: {
      bodySizeLimit: "5mb",
    },
  },
};

export default nextConfig;
