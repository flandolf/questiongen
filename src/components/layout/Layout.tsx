import '@/App.css';

import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';

import { useAppStore } from '@/store';
import { applyDesignTheme } from '@/themes/designThemes';

import { Header } from './Header';
import Titlebar from './Titlebar';

export function Layout() {
  const [isAndroid, setIsAndroid] = useState(false);
  const theme = useAppStore((s) => s.theme);

  useEffect(() => {
    if (typeof navigator !== 'undefined') {
      setIsAndroid(/Android/i.test(navigator.userAgent));
    }
  }, []);

  useEffect(() => {
    void applyDesignTheme(theme);
  }, [theme]);

  return (
    <div className='flex flex-col h-dvh bg-background text-foreground overflow-hidden'>
      {!isAndroid && <Titlebar />}
      <Header />
      <main className='flex-1 min-h-0 min-w-0 overflow-y-auto'>
        <Outlet />
      </main>
    </div>
  );
}
