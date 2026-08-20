import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Fusa Risk Radar",
  description: "Local-first project and milestone planning workspace.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <head>
        <script src="/vendor/xlsx.full.min.js" />
      </head>
      <body>{children}</body>
    </html>
  );
}
