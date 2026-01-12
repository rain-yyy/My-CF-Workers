/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // SEO优化配置
  compress: true,
  poweredByHeader: false,
  // 图片优化
  images: {
    formats: ['image/avif', 'image/webp'],
  },
};

module.exports = nextConfig;

