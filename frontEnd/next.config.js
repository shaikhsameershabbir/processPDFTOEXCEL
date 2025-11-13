/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer }) => {
    // Handle PDF.js worker
    if (!isServer) {
      config.resolve.alias = {
        ...config.resolve.alias,
        'pdfjs-dist/build/pdf.worker.entry': 'pdfjs-dist/legacy/build/pdf.worker.js',
      }
    }
    
    // Handle canvas for PDF.js
    config.resolve.fallback = {
      ...config.resolve.fallback,
      canvas: false,
    }
    
    return config
  },
}

module.exports = nextConfig
