import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ChatSite - 在线聊天室",
  description: "一个简单的在线聊天室，支持文字聊天和文件传输",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <head>
        <link rel="icon" href="/python-favicon.svg" type="image/svg+xml" />
      </head>
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
