import './globals.css';
import type { Metadata } from 'next';
import localFont from 'next/font/local';

const anuphan = localFont({
  src: [
    { path: '../fonts/anuphan-thai-variable.woff2', weight: '100 700', style: 'normal' },
    { path: '../fonts/anuphan-latin-variable.woff2', weight: '100 700', style: 'normal' },
  ],
  display: 'swap',
  variable: '--font-anuphan',
});

export const metadata: Metadata = {
  title: 'LockComputer Admin',
  description: 'แดชบอร์ดผู้ดูแลระบบ LockComputer มหาวิทยาลัยมหาสารคาม',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="th"><body className={anuphan.variable}>{children}</body></html>;
}
