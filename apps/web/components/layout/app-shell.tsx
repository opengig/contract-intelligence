'use client';

import { usePathname } from 'next/navigation';
import { Sidebar } from './sidebar';

const NO_SIDEBAR_PATHS = ['/login'];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const showSidebar = !NO_SIDEBAR_PATHS.includes(pathname);

  if (!showSidebar) {
    return <>{children}</>;
  }

  return (
    <div className='flex h-screen overflow-hidden'>
      <Sidebar />
      <main className='flex-1 overflow-auto'>{children}</main>
    </div>
  );
}
