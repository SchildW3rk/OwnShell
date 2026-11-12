import { LegalLayout } from '../components/LegalLayout';
import * as m from '../paraglide/messages';

export function Privacy() {
  return (
    <LegalLayout title={m.legal_privacy_title()}>
      <p className="text-[#969696] leading-relaxed mb-8 text-lg">{m.legal_privacy_intro()}</p>

      <section className="mb-8">
        <h2 className="text-xl font-semibold text-white mb-4">
          {m.legal_privacy_no_tracking_title()}
        </h2>
        <p className="text-[#969696] leading-relaxed">{m.legal_privacy_no_tracking_text()}</p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold text-white mb-4">{m.legal_privacy_no_data_title()}</h2>
        <p className="text-[#969696] leading-relaxed">{m.legal_privacy_no_data_text()}</p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold text-white mb-4">
          {m.legal_privacy_hosting_title()}
        </h2>
        <p className="text-[#969696] leading-relaxed">{m.legal_privacy_hosting_text()}</p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold text-white mb-4">{m.legal_privacy_license_title()}</h2>
        <p className="text-[#969696] leading-relaxed">{m.legal_privacy_license_text()}</p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold text-white mb-4">{m.legal_privacy_updates_title()}</h2>
        <p className="text-[#969696] leading-relaxed">{m.legal_privacy_updates_text()}</p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold text-white mb-4">
          {m.legal_privacy_diagnostics_title()}
        </h2>
        <p className="text-[#969696] leading-relaxed">{m.legal_privacy_diagnostics_text()}</p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold text-white mb-4">{m.legal_privacy_contact_title()}</h2>
        <p className="text-[#969696] leading-relaxed">{m.legal_privacy_contact_text()}</p>
        <p className="text-[#06b6d4] mt-2">r.schober@outlook.com</p>
      </section>
    </LegalLayout>
  );
}
