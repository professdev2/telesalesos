import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Kept for any remaining Server Action payloads; file bytes upload
  // directly to Supabase Storage from the browser (see TrainingFileUploadForm).
  experimental: {
    serverActions: {
      bodySizeLimit: "52mb",
    },
  },
};

export default nextConfig;
