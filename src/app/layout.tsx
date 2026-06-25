import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = {
  title: "Product Pics - AI Product Photo Generator",
  description: "Generate professional ecommerce product photos for kids and adult apparel with AI",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased font-sans selection:bg-pink-500 selection:text-white">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
