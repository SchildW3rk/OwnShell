import { Check, Sparkles, Briefcase, UsersRound } from 'lucide-react';
import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import * as m from '../paraglide/messages';

const checkoutUrl = import.meta.env.VITE_LEMON_INDIVIDUAL_CHECKOUT_URL?.trim() || '';

function isExternalCheckoutUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && (parsed.hostname === 'lemonsqueezy.com' || parsed.hostname.endsWith('.lemonsqueezy.com'));
  } catch {
    return false;
  }
}

function CheckoutButton({ children }: { children: ReactNode }) {
  if (!isExternalCheckoutUrl(checkoutUrl)) {
    return (
      <button
        type="button"
        disabled
        className="mt-auto block w-full cursor-not-allowed rounded-lg border border-[#3E3E42] bg-[#252526] py-2.5 text-center font-semibold text-[#8F8F8F]"
      >
        {m.pricing_checkout_unconfigured()}
      </button>
    );
  }

  return (
    <a
      href={checkoutUrl}
      className="mt-auto flex w-full items-center justify-center rounded-lg bg-[#06b6d4] py-2.5 font-semibold text-[#061014] transition-colors hover:bg-[#38d5ee]"
      rel="noopener noreferrer"
    >
      {children}
    </a>
  );
}

function PricingFeatureItem({
  children,
  delay = 0,
  emphasis = false,
}: {
  children: ReactNode;
  delay?: number;
  emphasis?: boolean;
}) {
  return (
    <motion.li
      className="flex items-start gap-2.5 text-sm"
      initial={{ opacity: 0, x: -12 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true, amount: 0.55 }}
      transition={{ duration: 0.34, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      <span className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-[#06b6d4]/12 text-[#06b6d4] shadow-[0_0_18px_rgba(6,182,212,0.14)]">
        <Check className="h-3.5 w-3.5" />
      </span>
      <span className={emphasis ? 'font-medium text-white' : 'text-[#CCCCCC]'}>{children}</span>
    </motion.li>
  );
}

function PlanPrice({ price, period }: { price: string; period: string }) {
  return (
    <div className="mb-5 flex flex-wrap items-end gap-x-2 gap-y-1">
      <span className="text-4xl font-bold text-white">{price}</span>
      <span className="pb-1.5 text-sm font-medium text-[#9fb8bf]">{period}</span>
    </div>
  );
}

export function Pricing() {
  const personalFeatures = [
    m.pricing_personal_f1(),
    m.pricing_personal_f2(),
    m.pricing_personal_f3(),
  ];
  const commercialFeatures = [
    m.pricing_commercial_f1(),
    m.pricing_commercial_f2(),
    m.pricing_commercial_f3(),
    m.pricing_commercial_f4(),
  ];

  return (
    <section id="pricing" className="py-20 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Section Header */}
        <motion.div
          className="text-center mb-16"
          initial={{ opacity: 0, y: 28 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.45 }}
          transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#06b6d4]/10 border border-[#06b6d4]/30 text-[#06b6d4] text-sm font-medium mb-6">
            <Sparkles className="w-4 h-4" />
            {m.pricing_badge()}
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">{m.pricing_title()}</h2>
          <p className="text-lg text-[#969696] max-w-2xl mx-auto">{m.pricing_subtitle()}</p>
        </motion.div>

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto items-stretch">
          {/* Personal */}
          <motion.div
            className="relative p-6 bg-[#1E1E1E] rounded-2xl border border-[#3E3E42] flex flex-col"
            initial={{ opacity: 0, y: 34 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="mb-5">
              <h3 className="text-lg font-semibold text-white mb-1">
                {m.pricing_personal_title()}
              </h3>
              <p className="text-[#969696] text-sm">{m.pricing_personal_desc()}</p>
            </div>

            <PlanPrice price={m.pricing_personal_price()} period={m.pricing_personal_period()} />

            <ul className="space-y-2.5 mb-6 flex-grow">
              {personalFeatures.map((feature, index) => (
                <PricingFeatureItem key={feature} delay={0.03 * index}>
                  {feature}
                </PricingFeatureItem>
              ))}
            </ul>

            <a
              href="#download"
              className="mt-auto flex w-full items-center justify-center rounded-lg border border-[#06b6d4]/45 bg-[#06b6d4]/10 py-2.5 font-semibold text-[#7defff] transition-colors hover:border-[#06b6d4] hover:bg-[#06b6d4]/18"
            >
              {m.pricing_personal_cta()}
            </a>
          </motion.div>

          {/* Commercial / Individual */}
          <motion.div
            className="relative p-6 bg-gradient-to-b from-[#06b6d4]/10 to-[#1E1E1E] rounded-2xl border-2 border-[#06b6d4] flex flex-col"
            initial={{ opacity: 0, y: 34 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.55, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
              <div className="inline-flex items-center gap-1.5 whitespace-nowrap px-3 py-1 bg-[#06b6d4] text-[#061014] text-xs font-semibold rounded-full shadow-lg">
                <Briefcase className="w-3.5 h-3.5" />
                {m.pricing_commercial_badge()}
              </div>
            </div>

            <div className="mb-5 mt-1">
              <h3 className="text-lg font-semibold text-white mb-1">
                {m.pricing_commercial_title()}
              </h3>
              <p className="text-[#969696] text-sm">{m.pricing_commercial_desc()}</p>
            </div>

            <PlanPrice
              price={m.pricing_commercial_price()}
              period={m.pricing_commercial_period()}
            />

            <ul className="space-y-2.5 mb-6 flex-grow">
              {commercialFeatures.map((feature, index) => (
                <PricingFeatureItem key={feature} delay={0.03 * index} emphasis={index > 0}>
                  {feature}
                </PricingFeatureItem>
              ))}
            </ul>

            <CheckoutButton>{m.pricing_commercial_cta()}</CheckoutButton>
            <p className="mt-3 text-center text-xs text-[#8f8f8f]">{m.pricing_checkout_note()}</p>
          </motion.div>
        </div>

        <div className="mt-10 mx-auto max-w-4xl space-y-3 text-center text-sm text-[#969696]">
          <p className="text-[#d7faff]">{m.pricing_evaluation()}</p>
          <p>{m.pricing_honor()}</p>
          <p className="inline-flex items-start gap-2 text-left text-xs text-[#8f8f8f]">
            <UsersRound className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-[#06b6d4]" />
            {m.pricing_team_note()}
          </p>
        </div>
      </div>
    </section>
  );
}
