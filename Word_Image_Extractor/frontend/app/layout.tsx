import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "无损提取 Word 图片 | Word Image Extractor",
  description: "上传 Word 文档，快速无损导出其中的图片。"
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

