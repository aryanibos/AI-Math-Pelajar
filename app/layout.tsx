import React from "react"
import type { Metadata } from 'next'
import { Nunito, Fredoka } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'
import 'katex/dist/katex.min.css'

const nunito = Nunito({ subsets: ["latin"], variable: "--font-nunito" });
const fredoka = Fredoka({ subsets: ["latin"], variable: "--font-fredoka" });

export const metadata: Metadata = {
  title: 'MathGenius - AI Pemecah Soal Matematika',
  description: 'Aplikasi AI untuk membantu menyelesaikan soal matematika untuk SD, SMP, SMA/SMK, dan S1',
  generator: 'v0.app',
  icons: {
    icon: '/icon.svg',
    apple: '/icon.svg',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="id">
      <body className={`${nunito.variable} ${fredoka.variable} font-sans antialiased`}>
        {children}
        <Analytics />
      </body>
    </html>
  )
}
