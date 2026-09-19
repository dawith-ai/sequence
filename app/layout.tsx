import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'One pice',
  description: '작은 선물 여러 개보다, 정말 원하는 하나',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  )
}
