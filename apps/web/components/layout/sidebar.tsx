'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { FileUp, Building2, Sparkles, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import { clearToken } from '@/lib/auth';

const nav = [
  { href: '/agent', label: 'Agent', icon: Sparkles },
  { href: '/contracts', label: 'Upload Contract', icon: FileUp },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  function handleLogout() {
    clearToken();
    router.replace('/login');
  }

  return (
    <aside className='flex h-screen w-60 flex-col border-r bg-sidebar'>
      <div className='flex h-16 items-center gap-2 border-b px-6'>
        <Building2 className='size-5 text-primary' />
        <div>
          <p className='text-sm font-semibold leading-none'>ContractIQ</p>
          <p className='text-xs text-muted-foreground'>Audit Engine</p>
        </div>
      </div>

      <nav className='flex-1 space-y-1 p-3'>
        {nav.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                active
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
            >
              <Icon className='size-4' />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className='border-t p-4'>
        <p className='text-xs text-muted-foreground'>ABC Retail India</p>
        <p className='text-xs font-medium'>Logistics Audit</p>
        <button
          onClick={handleLogout}
          className='mt-3 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground'
        >
          <LogOut className='size-3.5' />
          Sign out
        </button>
      </div>
    </aside>
  );
}
