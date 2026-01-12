import { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  const siteUrl = "https://www.docxkit.net";

  return {
    name: "Word图片提取器 - 无损导出Word文档中的图片",
    short_name: "Word图片提取器",
    description: "专业的Word图片提取工具，支持.doc和.docx格式，无损导出高清图片。",
    start_url: "/",
    display: "standalone",
    background_color: "#0a0a0a",
    theme_color: "#10b981",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}

