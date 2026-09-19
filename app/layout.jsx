import './globals.css'

export const metadata = {
  title: 'One pice',
  description: '작은 선물 여러 개보다, 정말 원하는 하나',
}

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  )
}
