import type { Metadata } from 'next';
import { Providers } from '@/components/providers';
import './globals.css';
import './workspace.css';
import './workspace-redesign.css';
import './theme.css';
import { themeInitScript } from '@/lib/workspace-theme';
export const metadata:Metadata={title:'Pravista — See Ahead. Build Tomorrow.',description:'Understand your skills. Explore future careers. Build a pathway that grows with you.'};
export default function RootLayout({children}:{children:React.ReactNode}) { return <html lang="en" data-scroll-behavior="smooth" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{__html:themeInitScript}}/></head><body><Providers>{children}</Providers></body></html>; }
