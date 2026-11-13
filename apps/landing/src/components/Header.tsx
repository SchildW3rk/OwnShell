import { Github, Globe, Terminal } from 'lucide-react';
import * as m from '../paraglide/messages';
import { getLocale, setLocale } from '../paraglide/runtime';
import { GITHUB_URL, docsUrl } from '../links';

export function Header() {
  const currentLocale = getLocale();

  const toggleLanguage = () => {
    setLocale(currentLocale === 'de' ? 'en' : 'de');
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-[#0a0a0f]/80 backdrop-blur-lg border-b border-[#3E3E42]/50">
      <div className="max-w-6xl mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <a href="/" className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#06b6d4]/30 bg-[#06b6d4]/10 text-[#06b6d4]">
              <Terminal className="h-4.5 w-4.5" aria-hidden="true" />
            </span>
            <span className="text-lg font-semibold text-white">OwnShell</span>
            <span className="px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-[#06b6d4]/20 text-[#06b6d4] rounded border border-[#06b6d4]/30">
              Beta
            </span>
          </a>

          {/* Navigation */}
          <nav className="hidden md:flex items-center gap-6">
            <a
              href="#features"
              className="text-sm text-[#969696] hover:text-white transition-colors"
            >
              {m.nav_features()}
            </a>
            <a
              href="#security"
              className="text-sm text-[#969696] hover:text-white transition-colors"
            >
              {m.nav_security()}
            </a>
            <a
              href="#open-source"
              className="text-sm text-[#969696] hover:text-white transition-colors"
            >
              {m.nav_opensource()}
            </a>
            <a href="#faq" className="text-sm text-[#969696] hover:text-white transition-colors">
              {m.nav_faq()}
            </a>
            <a
              href={docsUrl(currentLocale)}
              className="text-sm text-[#969696] hover:text-white transition-colors"
            >
              {m.nav_docs()}
            </a>
          </nav>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-2 py-1.5 text-sm text-[#969696] hover:text-white transition-colors"
              aria-label={m.nav_github()}
            >
              <Github className="w-4 h-4" />
              <span className="hidden sm:inline font-medium">{m.nav_github()}</span>
            </a>
            {/* Language Switcher */}
            <button
              type="button"
              onClick={toggleLanguage}
              className="flex items-center gap-1.5 px-2 py-1.5 text-sm text-[#969696] hover:text-white transition-colors"
              title={currentLocale === 'de' ? 'Switch to English' : 'Auf Deutsch wechseln'}
            >
              <Globe className="w-4 h-4" />
              <span className="font-medium">{currentLocale.toUpperCase()}</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
