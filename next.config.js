/** @type {import('next').NextConfig} */
const nextConfig = {
  // Exclude server-only modules from client bundles
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        crypto: false,
        stream: false,
        buffer: false,
      };
    }
    return config;
  },
  // Increase body size limit for large document uploads (future use)
  experimental: {
    serverComponentsExternalPackages: ['pdf-parse', 'xlsx', 'mammoth', 'adm-zip'],
  },
};

export default nextConfig;
