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
  // 启用静态页面生成优化
  experimental: {
    optimizeCss: true,
  },
};

module.exports = nextConfig;

