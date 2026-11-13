import { Github, Scale } from 'lucide-react';
import { motion } from 'motion/react';
import * as m from '../paraglide/messages';
import { GITHUB_URL, LICENSE_URL } from '../links';

export function OpenSource() {
  return (
    <section id="open-source" className="py-20 px-4">
      <motion.div
        className="max-w-3xl mx-auto text-center"
        initial={{ opacity: 0, y: 28 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.45 }}
        transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#06b6d4]/10 border border-[#06b6d4]/30 text-[#06b6d4] text-sm font-medium mb-6">
          <Scale className="w-4 h-4" />
          {m.opensource_badge()}
        </div>
        <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">{m.opensource_title()}</h2>
        <p className="text-lg text-[#969696] mb-8">{m.opensource_subtitle()}</p>
        <div className="flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#06b6d4] px-6 py-3 font-semibold text-[#061014] transition-colors hover:bg-[#38d5ee]"
          >
            <Github className="h-5 w-5" />
            {m.hero_cta_github()}
          </a>
          <a
            href={LICENSE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/[0.04] px-6 py-3 font-semibold text-[#e6e6e6] transition-colors hover:border-[#06b6d4]/60 hover:text-white"
          >
            <Scale className="h-5 w-5" />
            {m.opensource_license_cta()}
          </a>
        </div>
      </motion.div>
    </section>
  );
}
