'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Database, FileSpreadsheet, FileText, Home, Scissors } from 'lucide-react';

interface NavbarProps {
  currentPage?: string;
}

export function Navbar({ currentPage }: NavbarProps) {
  const navItems = [
    {
      href: '/',
      label: 'Home',
      icon: Home,
      description: 'OCR Text Processing'
    },
    {
      href: '/getFinalExcel',
      label: 'Data Matching',
      icon: FileSpreadsheet,
      description: 'Match Excel data with database'
    },
    {
      href: '/parabhag-list',
      label: 'Parabhag List',
      icon: Database,
      description: 'Search and export parabhag data'
    },
    {
      href: '/pdf-to-excel',
      label: 'PDF to Excel',
      icon: FileText,
      description: 'Extract data from PDF files'
    },
    {
      href: '/split-pdf',
      label: 'Split PDF',
      icon: Scissors,
      description: 'Split PDF into smaller files'
    }
  ];

  return (
    <nav className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center space-x-4">
            <Link href="/" className="flex items-center space-x-2">
              <div className="h-8 w-8 rounded bg-primary flex items-center justify-center">
                <span className="text-primary-foreground font-bold text-sm">CA</span>
              </div>
              <div>
                <h1 className="text-lg font-semibold">CSV Import Assembly</h1>
                <p className="text-xs text-muted-foreground">Data Processing Suite</p>
              </div>
            </Link>
          </div>
          
          <div className="flex items-center space-x-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentPage === item.href;
              
              return (
                <Link key={item.href} href={item.href}>
                  <Button
                    variant={isActive ? "default" : "outline"}
                    size="sm"
                    className="flex items-center gap-2"
                  >
                    <Icon className="h-4 w-4" />
                    <span className="hidden sm:inline">{item.label}</span>
                  </Button>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </nav>
  );
}
