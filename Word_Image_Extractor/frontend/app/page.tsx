"use client";

import { useCallback, useRef, useState } from "react";
import {
  CheckCircle2,
  FileText,
  Loader2,
  ShieldCheck,
  UploadCloud,
  Wand2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const API_ENDPOINT =
  "https://my-cf-workers-30995984708.europe-west1.run.app/extract";
const ACCEPTED_EXT = ["doc", "docx"];

function formatBytes(bytes: number) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const val = parseFloat((bytes / Math.pow(k, i)).toFixed(1));
  return `${val} ${sizes[i]}`;
}

function getExt(file: File) {
  const parts = file.name.split(".");
  return parts.length > 1 ? parts.pop()?.toLowerCase() ?? "" : "";
}

export default function HomePage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  const handleCandidate = useCallback((candidate: File) => {
    const ext = getExt(candidate);
    if (!ACCEPTED_EXT.includes(ext)) {
      setError("请上传 .doc 或 .docx 文件");
      setFile(null);
      setMessage(null);
      return;
    }
    setFile(candidate);
    setError(null);
    setMessage(null);
  }, []);

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setDragging(false);
      const candidate = event.dataTransfer.files?.[0];
      if (candidate) handleCandidate(candidate);
    },
    [handleCandidate]
  );

  const onInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const candidate = event.target.files?.[0];
      if (candidate) handleCandidate(candidate);
    },
    [handleCandidate]
  );

  const handleExtract = useCallback(async () => {
    if (!file) {
      setError("请先选择一个 Word 文件");
      return;
    }
    setError(null);
    setMessage(null);
    setProcessing(true);
    try {
      const formData = new FormData();
      formData.append("files", file);

      const res = await fetch(API_ENDPOINT, {
        method: "POST",
        body: formData
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "提取失败，请稍后再试");
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      const baseName =
        file.name.replace(/\.(docx?|DOCX?)$/, "") || "images";
      link.href = url;
      link.download = `${baseName}-images.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      setMessage("提取完成，正在下载图片压缩包。");
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "提取失败，请稍后再试";
      setError(msg);
    } finally {
      setProcessing(false);
    }
  }, [file]);

  return (
    <div className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-grid-slate bg-[size:36px_36px] opacity-30" />
      <div className="pointer-events-none absolute -left-10 top-10 h-72 w-72 rounded-full bg-emerald-500/20 blur-3xl" />
      <div className="pointer-events-none absolute -right-16 bottom-0 h-72 w-72 rounded-full bg-teal-500/20 blur-3xl" />

      <main className="relative z-10 mx-auto flex min-h-screen max-w-5xl flex-col px-6 py-16">
        <header className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/5 px-4 py-2 text-sm text-white/80 ring-1 ring-white/10">
              <ShieldCheck className="h-4 w-4 text-emerald-300" />
              本地处理 · 保留原图质量
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              上传 Word，提取其中的图片
            </h1>
            <p className="mt-2 max-w-2xl text-base text-white/70">
              轻量页面，专注于无损导出。无需阅读冗余文字，直接放入文档即可开始。
            </p>
            <div className="mt-4 flex flex-wrap gap-2 text-sm text-white/70">
              <span className="rounded-full bg-white/5 px-3 py-1">拖拽或选择文件</span>
              <span className="rounded-full bg-white/5 px-3 py-1">自动校验格式</span>
              <span className="rounded-full bg-white/5 px-3 py-1">提取后下载打包</span>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/80">
            <Wand2 className="h-5 w-5 text-emerald-300" />
            <div className="leading-tight">
              <div className="font-medium text-white">聚焦图片</div>
              <div className="text-white/60">忽略冗余，只保留高清图</div>
            </div>
          </div>
        </header>

        <section className="mt-10">
          <Card className="relative overflow-hidden">
            <div className="pointer-events-none absolute inset-x-10 top-4 h-16 rounded-full bg-emerald-500/20 blur-2xl" />
            <CardBody className="relative">
              <div
                onDragEnter={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  setDragging(false);
                }}
                onDrop={handleDrop}
                className={cn(
                  "group relative flex flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed border-white/10 bg-white/5 px-6 py-10 transition",
                  dragging
                    ? "border-emerald-300/80 bg-emerald-500/5 shadow-glow"
                    : "hover:border-white/20 hover:bg-white/8"
                )}
              >
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 text-emerald-300 shadow-inner">
                  <UploadCloud className="h-7 w-7" />
                </div>
                <div className="text-center space-y-1">
                  <div className="text-lg font-semibold text-white">
                    拖拽 Word 到这里，或
                    <button
                      onClick={() => inputRef.current?.click()}
                      className="ml-2 underline decoration-emerald-400 decoration-2 underline-offset-4 transition hover:text-emerald-200"
                    >
                      选择文件
                    </button>
                  </div>
                  <p className="text-sm text-white/60">
                    仅支持 .doc / .docx，文件会在本地读取以保证隐私。
                  </p>
                </div>
                <input
                  ref={inputRef}
                  type="file"
                  accept=".doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  className="hidden"
                  onChange={onInputChange}
                />
                {file && (
                  <div className="flex w-full flex-col items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/80 sm:flex-row sm:justify-between">
                    <div className="flex items-center gap-3">
                      <div className="rounded-xl bg-emerald-500/15 p-2">
                        <FileText className="h-5 w-5 text-emerald-300" />
                      </div>
                      <div>
                        <div className="font-medium text-white">{file.name}</div>
                        <div className="text-white/60">
                          {formatBytes(file.size)} · {getExt(file).toUpperCase()} 文件
                        </div>
                      </div>
                    </div>
                    <Button
                      size="md"
                      variant="primary"
                      onClick={handleExtract}
                      disabled={!file || processing}
                    >
                      {processing ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          正在提取
                        </>
                      ) : (
                        "开始提取"
                      )}
                    </Button>
                  </div>
                )}
                {message && (
                  <div className="w-full rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
                    {message}
                  </div>
                )}
                {error && (
                  <div className="w-full rounded-xl border border-amber-300/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                    {error}
                  </div>
                )}
              </div>
            </CardBody>
          </Card>
        </section>

        <section className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            {
              icon: <CheckCircle2 className="h-5 w-5 text-emerald-300" />,
              title: "无损导出",
              desc: "保留原尺寸与格式，避免压缩失真。"
            },
            {
              icon: <ShieldCheck className="h-5 w-5 text-emerald-300" />,
              title: "隐私优先",
              desc: "文件在浏览器侧处理，可选再上传到后端。"
            },
            {
              icon: <Wand2 className="h-5 w-5 text-emerald-300" />,
              title: "一步完成",
              desc: "上传即处理，提取后直接下载打包。"
            }
          ].map((item) => (
            <div
              key={item.title}
              className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-4"
            >
              <div className="mt-1 flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/15">
                {item.icon}
              </div>
              <div>
                <div className="font-semibold text-white">{item.title}</div>
                <div className="text-sm text-white/65">{item.desc}</div>
              </div>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}

