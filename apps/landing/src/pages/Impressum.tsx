import { LegalLayout } from '../components/LegalLayout';
import * as m from '../paraglide/messages';

export function Impressum() {
  return (
    <LegalLayout title={m.legal_impressum_title()}>
      <p className="mb-8 text-[#b8b8b8] leading-relaxed">{m.legal_impressum_intro()}</p>

      <section className="mb-8">
        <h2 className="text-xl font-semibold text-white mb-4">{m.legal_media_owner()}</h2>
        <p className="text-[#969696] leading-relaxed">
          Rene Schober
          <br />
          Schulstra&szlig;e 7, Top 4
          <br />
          5023 Salzburg
          <br />
          &Ouml;sterreich
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold text-white mb-4">{m.legal_contact()}</h2>
        <p className="text-[#969696] leading-relaxed">E-Mail: r.schober [at] outlook.com</p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold text-white mb-4">{m.legal_trade_title()}</h2>
        <dl className="grid gap-3 text-[#969696]">
          <div>
            <dt className="font-medium text-[#d6d6d6]">{m.legal_trade_wording()}</dt>
            <dd>{m.legal_trade_it_wording()}</dd>
          </div>
          <div>
            <dt className="font-medium text-[#d6d6d6]">{m.legal_gisa_number()}</dt>
            <dd>35413028</dd>
          </div>
          <div>
            <dt className="font-medium text-[#d6d6d6]">{m.legal_trade_sector()}</dt>
            <dd>{m.legal_trade_it_sector()}</dd>
          </div>
          <div>
            <dt className="font-medium text-[#d6d6d6]">{m.legal_authority()}</dt>
            <dd>{m.legal_authority_salzburg()}</dd>
          </div>
        </dl>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold text-white mb-4">
          {m.legal_additional_trade_title()}
        </h2>
        <dl className="grid gap-3 text-[#969696]">
          <div>
            <dt className="font-medium text-[#d6d6d6]">{m.legal_trade_wording()}</dt>
            <dd>{m.legal_trade_agency_wording()}</dd>
          </div>
          <div>
            <dt className="font-medium text-[#d6d6d6]">{m.legal_gisa_number()}</dt>
            <dd>35413066</dd>
          </div>
          <div>
            <dt className="font-medium text-[#d6d6d6]">{m.legal_trade_sector()}</dt>
            <dd>{m.legal_trade_agency_sector()}</dd>
          </div>
          <div>
            <dt className="font-medium text-[#d6d6d6]">{m.legal_authority()}</dt>
            <dd>{m.legal_authority_salzburg()}</dd>
          </div>
        </dl>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold text-white mb-4">{m.legal_responsible()}</h2>
        <p className="text-[#969696] leading-relaxed">Rene Schober</p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold text-white mb-4">{m.legal_disclosure_title()}</h2>
        <p className="text-[#969696] leading-relaxed">{m.legal_disclosure_text()}</p>
      </section>
    </LegalLayout>
  );
}
