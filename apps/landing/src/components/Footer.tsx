import { Link } from 'react-router-dom';
import { ShieldCheck, MessageCircle, Download, Terminal } from 'lucide-react';
import * as m from '../paraglide/messages';

const DISCORD_INVITE = 'https://discord.gg/Hz8M8Fq5ac';

export function Footer() {
  return (
    <footer className="py-12 px-4 border-t border-[#3E3E42]">
      <div className="max-w-6xl mx-auto">
        {/* Main Footer Content */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8 mb-12">
          {/* Brand */}
          <div className="sm:col-span-2 lg:col-span-1">
            <div className="flex items-center gap-2 mb-4">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#06b6d4]/30 bg-[#06b6d4]/10 text-[#06b6d4]">
                <Terminal className="h-4.5 w-4.5" aria-hidden="true" />
              </span>
              <span className="text-lg font-semibold text-white">OwnShell</span>
            </div>
            <p className="text-sm text-[#969696] mb-4">{m.footer_tagline()}</p>
            {/* Privacy Badge */}
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#06b6d4]/10 border border-[#06b6d4]/30 text-[#06b6d4] text-xs font-medium">
              <ShieldCheck className="w-3.5 h-3.5" />
              {m.footer_privacy_badge()}
            </div>
          </div>

          {/* Product */}
          <div>
            <h2 className="text-sm font-semibold text-white mb-4">{m.footer_product()}</h2>
            <ul className="space-y-2 text-sm">
              <li>
                <a href="#features" className="text-[#969696] hover:text-white transition-colors">
                  {m.nav_features()}
                </a>
              </li>
              <li>
                <a href="#security" className="text-[#969696] hover:text-white transition-colors">
                  {m.nav_security()}
                </a>
              </li>
              <li>
                <a href="#pricing" className="text-[#969696] hover:text-white transition-colors">
                  {m.nav_pricing()}
                </a>
              </li>
              <li>
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="inline-flex items-center gap-1.5 text-[#969696] hover:text-white transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  {m.nav_download()}
                </a>
              </li>
            </ul>
          </div>

          {/* Community */}
          <div>
            <h2 className="text-sm font-semibold text-white mb-4">{m.footer_resources()}</h2>
            <ul className="space-y-2 text-sm">
              <li>
                <a
                  href={DISCORD_INVITE}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-[#969696] hover:text-white transition-colors"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  Discord
                </a>
              </li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h2 className="text-sm font-semibold text-white mb-4">{m.footer_legal()}</h2>
            <ul className="space-y-2 text-sm">
              <li>
                <Link to="/impressum" className="text-[#969696] hover:text-white transition-colors">
                  {m.legal_impressum_title()}
                </Link>
              </li>
              <li>
                <Link to="/privacy" className="text-[#969696] hover:text-white transition-colors">
                  {m.legal_privacy_title()}
                </Link>
              </li>
              <li>
                <Link to="/terms" className="text-[#969696] hover:text-white transition-colors">
                  {m.legal_terms_title()}
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="pt-8 border-t border-[#3E3E42]">
          <p className="text-sm text-[#969696] text-center">
            &copy; {new Date().getFullYear()} {m.footer_copyright()}
          </p>
        </div>
      </div>
    </footer>
  );
}
