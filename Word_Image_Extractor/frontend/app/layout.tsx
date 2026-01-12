import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

// 网站基础URL - 请根据实际部署域名修改
const siteUrl = "https://www.docxkit.net";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Word图片提取器 - 无损导出Word文档中的图片 | 免费在线工具",
    template: "%s | Word图片提取器"
  },
  description: "专业的Word图片提取工具，支持.doc和.docx格式，无损导出高清图片。本地处理保护隐私，一键提取Word文档中的所有图片并打包下载。免费在线工具，无需注册。",
  keywords: [
    "Word图片提取",
    "Word提取图片",
    "docx提取图片",
    "Word文档图片导出",
    "在线Word图片提取器",
    "免费Word工具",
    "Word图片批量导出",
    "docx图片下载",
    "Word文档图片提取工具",
    "无损图片提取"
  ],
  authors: [{ name: "Word Image Extractor" }],
  creator: "Word Image Extractor",
  publisher: "Word Image Extractor",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  openGraph: {
    type: "website",
    locale: "zh_CN",
    url: siteUrl,
    siteName: "Word图片提取器",
    title: "Word图片提取器 - 无损导出Word文档中的图片",
    description: "专业的Word图片提取工具，支持.doc和.docx格式，无损导出高清图片。本地处理保护隐私，一键提取Word文档中的所有图片并打包下载。",
    images: [
      {
        url: `${siteUrl}/og-image.png`,
        width: 1200,
        height: 630,
        alt: "Word图片提取器",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Word图片提取器 - 无损导出Word文档中的图片",
    description: "专业的Word图片提取工具，支持.doc和.docx格式，无损导出高清图片。免费在线工具，无需注册。",
    images: [`${siteUrl}/og-image.png`],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  alternates: {
    canonical: siteUrl,
  },
  category: "工具",
  classification: "在线工具",
  manifest: "/manifest.json",
  icons: {
    icon: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
  other: {
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "black-translucent",
    "mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#10b981" },
    { media: "(prefers-color-scheme: dark)", color: "#10b981" },
  ],
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" className="bg-ink text-white">
      <body className={`${inter.className} min-h-screen bg-ink antialiased`}>
        {children}
      </body>
    </html>
  );
}

