/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' https://www.youtube.com https://s.ytimg.com",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: https:",
              "frame-src https://www.youtube.com",
              "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://www.youtube.com",
              "media-src 'self' https:",
              "object-src 'none'",
              "base-uri 'self'",
              "frame-ancestors 'none'"
            ].join("; ")
          },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" }
        ]
      }
    ];
  }
};

export default nextConfig;
