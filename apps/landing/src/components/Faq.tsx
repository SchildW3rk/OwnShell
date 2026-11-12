import { ChevronDown, HelpCircle } from 'lucide-react';
import * as m from '../paraglide/messages';

export function Faq() {
  // legal review required: faq_refund_a and faq_commercial_a describe refund and license terms.
  const items = [
    { q: m.faq_commercial_q(), a: m.faq_commercial_a() },
    { q: m.faq_source_q(), a: m.faq_source_a() },
    { q: m.faq_renewal_q(), a: m.faq_renewal_a() },
    { q: m.faq_account_q(), a: m.faq_account_a() },
    { q: m.faq_data_q(), a: m.faq_data_a() },
    { q: m.faq_refund_q(), a: m.faq_refund_a() },
  ];

  return (
    <section id="faq" className="py-20 px-4 border-t border-[#2b2b2e]">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#06b6d4]/10 border border-[#06b6d4]/30 text-[#06b6d4] text-sm font-medium mb-6">
            <HelpCircle className="w-4 h-4" />
            {m.faq_badge()}
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold text-white">{m.faq_title()}</h2>
        </div>

        <div className="space-y-3">
          {items.map((item) => (
            <details
              key={item.q}
              className="group rounded-xl border border-[#3E3E42] bg-[#141416]/70 px-5 py-4 open:border-[#06b6d4]/40"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-white [&::-webkit-details-marker]:hidden">
                {item.q}
                <ChevronDown className="h-4 w-4 flex-shrink-0 text-[#06b6d4] transition-transform group-open:rotate-180" />
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-[#b8b8b8]">{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
