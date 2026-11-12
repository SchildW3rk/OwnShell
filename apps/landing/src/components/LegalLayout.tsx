import { Link } from 'react-router-dom';
import { ArrowLeft, Terminal } from 'lucide-react';
import { Footer } from './Footer';
import * as m from '../paraglide/messages';

interface LegalLayoutProps {
  title: string;
  children: React.ReactNode;
}

export function LegalLayout({ title, children }: LegalLayoutProps) {
  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      {/* Simple Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-[#0a0a0f]/80 backdrop-blur-md border-b border-[#3E3E42]/50">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#06b6d4]/30 bg-[#06b6d4]/10 text-[#06b6d4]">
              <Terminal className="h-4.5 w-4.5" aria-hidden="true" />
            </span>
            <span className="text-lg font-semibold text-white">OwnShell</span>
          </Link>
          <Link
            to="/"
            className="flex items-center gap-2 text-sm text-[#969696] hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            {m.legal_back_home()}
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="pt-24 pb-16 px-4">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-3xl font-bold text-white mb-8">{title}</h1>
          <div className="prose prose-invert prose-sm max-w-none">{children}</div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
