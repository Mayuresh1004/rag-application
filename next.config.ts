// next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '20mb', // increase from default 1MB
    },
  },
}

module.exports = nextConfig
