import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/lib/ThemeContext";
import ErrorBoundary from "@/app/components/ErrorBoundary";
import PwaBootstrap from "@/app/components/PwaBootstrap";
import ApiCounterBadge from "@/app/components/dev/ApiCounterBadge";
import WebVitalsInit from "@/app/components/dev/WebVitalsInit";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"] });

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"] });

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#2563eb",
  viewportFit: "cover" };

export const metadata: Metadata = {
  title: "AllERP",
  description: "병원 경영 통합 관리 시스템",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "MSO" },
  icons: {
    icon: "/favicon-tab.png",
    apple: "/apple-touch-icon.png" } };

export default function RootLayout({
  children }: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/favicon-tab.png" type="image/png" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link
          rel="preload"
          as="style"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css"
        />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css"
        />
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="anonymous" />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var s=localStorage.getItem('erp-font-size');if(s){document.documentElement.style.fontSize=s+'px';}}catch(e){}})();` }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} font-app antialiased bg-[var(--background)] text-[var(--foreground)]`}
      >
        <ThemeProvider>
          <PwaBootstrap />
          <WebVitalsInit />
          <ErrorBoundary>{children}</ErrorBoundary>
          <ApiCounterBadge />
        </ThemeProvider>
      </body>
    </html>
  );
}
