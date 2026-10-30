import type { Metadata } from "next";
import { Geist_Mono, Inter } from "next/font/google";
import { NavigationProgress } from "@/components/navigation-progress";
import "./globals.css";

// Inter: the face Shopify Admin uses; tall letters stay readable at small table sizes.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "Bin Khalid POS", template: "%s · Bin Khalid POS" },
  description: "Retail management system for Bin Khalid",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">
        <NavigationProgress />
        {children}
      </body>
    </html>
  );
}
