import type { Metadata } from "next";
import { Inter, Instrument_Serif, IBM_Plex_Mono, Archivo_Black } from "next/font/google";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { SmoothScroll } from "@/components/smooth-scroll";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });
const serif = Instrument_Serif({ subsets: ["latin"], weight: "400", variable: "--font-serif" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-mono" });
const display = Archivo_Black({ subsets: ["latin"], weight: "400", variable: "--font-display" });

export const metadata: Metadata = {
  title: "FLAG — Know who pays",
  description: "Balanced, proof-backed engagement log for PH freelancers.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-scroll-behavior="smooth" suppressHydrationWarning className={`${inter.variable} ${serif.variable} ${mono.variable} ${display.variable}`}>
      <body className="noise min-h-screen bg-paper text-ink antialiased">
        <SmoothScroll>
          <SiteHeader />
          <main className="mx-auto w-full max-w-6xl px-5 sm:px-8">{children}</main>
          <SiteFooter />
        </SmoothScroll>
      </body>
    </html>
  );
}
