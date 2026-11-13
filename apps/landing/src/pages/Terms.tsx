import { LegalLayout } from '../components/LegalLayout';
import { LICENSE_URL } from '../links';
import * as m from '../paraglide/messages';

export function Terms() {
  return (
    <LegalLayout title={m.legal_terms_title()}>
      <p className="text-[#969696] leading-relaxed mb-8 text-lg">{m.legal_terms_intro()}</p>

      <section className="mb-8">
        <h2 className="text-xl font-semibold text-white mb-4">{m.legal_terms_license_title()}</h2>
        <p className="text-[#969696] leading-relaxed">{m.legal_terms_license_text()}</p>
        <a
          href={LICENSE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block mt-3 text-[#06b6d4] hover:underline"
        >
          {m.legal_terms_license_link()}
        </a>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold text-white mb-4">{m.legal_terms_warranty_title()}</h2>
        <p className="text-[#969696] leading-relaxed">{m.legal_terms_warranty_text()}</p>
      </section>

      <section className="mb-8 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
        <h2 className="text-xl font-semibold text-red-400 mb-4">{m.legal_terms_data_title()}</h2>
        <p className="text-[#CCCCCC] leading-relaxed">{m.legal_terms_data_text()}</p>
      </section>
    </LegalLayout>
  );
}
