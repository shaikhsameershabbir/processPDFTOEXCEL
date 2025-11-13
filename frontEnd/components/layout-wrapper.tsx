'use client';

import { Navbar } from './navbar';

interface LayoutWrapperProps {
  children: React.ReactNode;
  currentPage?: string;
}

export function LayoutWrapper({ children, currentPage }: LayoutWrapperProps) {
  return (
    <div className="min-h-screen bg-background">
      <Navbar currentPage={currentPage} />
      <main className="container mx-auto py-6">
        {children}
      </main>
    </div>
  );
}
