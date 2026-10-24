import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans-app",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono-app",
  subsets: ["latin"],
  display: "swap",
});

import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = {
  title: "EzyRent — Malaysian PropTech & Rent Collection System",
  description: "Enterprise multi-tenant rent collection, automated invoice scheduling, and Malaysian payment gateway integration.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable} dark h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-[#080a0f] text-neutral-100 selection:bg-emerald-500/30 selection:text-emerald-200 font-sans">
        <div className="fixed inset-0 pointer-events-none -z-10 overflow-hidden">
          {/* Ambient luminous glow spots */}
          <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-gradient-to-b from-emerald-500/12 via-teal-500/5 to-transparent blur-3xl opacity-80" />
          <div className="absolute top-1/3 -left-40 w-[600px] h-[400px] bg-sky-500/5 blur-3xl rounded-full" />
          <div className="absolute bottom-10 -right-40 w-[600px] h-[400px] bg-emerald-600/5 blur-3xl rounded-full" />
          {/* Subtle grid texture */}
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]" />
        </div>
        {children}
        <Toaster position="top-right" richColors closeButton theme="dark" />
      </body>
    </html>
  );
}
