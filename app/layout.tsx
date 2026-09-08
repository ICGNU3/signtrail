import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SignTrail — Prepare, Send, Sign, Verify",
  description: "A local-first document signing workflow with private recipient links and portable proof receipts."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
