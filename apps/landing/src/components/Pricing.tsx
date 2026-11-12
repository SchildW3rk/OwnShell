import { BadgePercent, Check, Sparkles, CalendarDays, ShieldCheck, ServerCog, UsersRound } from 'lucide-react';
import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import * as m from '../paraglide/messages';

type PlanKind = 'monthly' | 'yearly';

const sharedCheckoutUrl = import.meta.env.VITE_LEMON_CHECKOUT_URL?.trim() || '';

const checkoutUrls: Record<PlanKind, string> = {
  monthly: import.meta.env.VITE_LEMON_MONTHLY_CHECKOUT_URL?.trim() || sharedCheckoutUrl,
  yearly: import.meta.env.VITE_LEMON_YEARLY_CHECKOUT_URL?.trim() || sharedCheckoutUrl,
};

function isExternalCheckoutUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.hostname.endsWith('lemonsqueezy.com');
  } catch {
    return false;
  }
}

function CheckoutButton({
  plan,
  children,
  featured = false,
}: {
  plan: PlanKind;
  children: ReactNode;
  featured?: boolean;
}) {
  const checkoutUrl = checkoutUrls[plan];
  const isConfigured = isExternalCheckoutUrl(checkoutUrl);
  const className = featured
    ? 'mt-auto flex w-full items-center justify-center rounded-lg bg-[#06b6d4] py-2.5 font-semibold text-[#061014] transition-colors hover:bg-[#38d5ee]'
    : 'mt-auto flex w-full items-center justify-center rounded-lg border border-[#06b6d4]/45 bg-[#06b6d4]/10 py-2.5 font-semibold text-[#7defff] transition-colors hover:border-[#06b6d4] hover:bg-[#06b6d4]/18';

  if (!isConfigured) {
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
    <a href={checkoutUrl} className={className} rel="noopener noreferrer">
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

function PlanPrice({
  regularPrice,
  discountPrice,
  period,
  discountPeriod,
  featured = false,
}: {
  regularPrice: string;
  discountPrice: string;
  period: string;
  discountPeriod: string;
  featured?: boolean;
}) {
  const frameClass = featured
    ? 'border-[#06b6d4]/45 bg-[#061c22]/75 shadow-[0_18px_50px_rgba(6,182,212,0.12)]'
    : 'border-white/10 bg-white/[0.035]';

  return (
    <div className={`mb-5 rounded-xl border p-4 ${frameClass}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[#06b6d4]/35 bg-[#06b6d4]/10 px-2.5 py-1 text-xs font-semibold text-[#7defff]">
          <BadgePercent className="h-3.5 w-3.5" />
          {m.pricing_discount_badge()}
        </span>
        <span className="text-xs font-medium text-[#9fb8bf]">{m.pricing_discount_limit()}</span>
      </div>

      <div className="mt-4">
        <div className="text-sm font-medium text-[#8f8f8f] line-through decoration-[#06b6d4]/70 decoration-2">
          &euro;{regularPrice}
          {period}
        </div>
        <div className="mt-1 flex flex-wrap items-end gap-x-2 gap-y-1">
          <span className="text-4xl font-bold text-white">&euro;{discountPrice}</span>
          <span className="pb-1.5 text-sm font-medium text-[#d7faff]">{discountPeriod}</span>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-[#06b6d4]/20 bg-[#061014]/55 px-3 py-2 text-sm">
        <span className="text-[#9fb8bf]">{m.pricing_discount_code_label()}</span>
        <code className="rounded-md border border-[#06b6d4]/35 bg-[#06b6d4]/10 px-2 py-1 font-mono text-sm font-semibold text-[#7defff]">
          {m.pricing_discount_code()}
        </code>
      </div>
    </div>
  );
}

export function Pricing() {
  const sharedFeatures = [
    m.pricing_feature_openssh(),
    m.pricing_feature_storage(),
    m.pricing_feature_databases(),
    m.pricing_feature_docker(),
    m.pricing_feature_api(),
    m.pricing_feature_vault(),
    m.pricing_feature_updates(),
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
          <p className="mt-4 text-sm text-[#06b6d4] font-medium">{m.pricing_launch_note()}</p>
        </motion.div>

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto items-stretch">
          {/* Monthly Plan */}
          <motion.div
            className="relative p-6 bg-[#1E1E1E] rounded-2xl border border-[#3E3E42] flex flex-col"
            initial={{ opacity: 0, y: 34 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="mb-5">
              <h3 className="text-lg font-semibold text-white mb-1">{m.pricing_monthly_title()}</h3>
              <p className="text-[#969696] text-sm">{m.pricing_monthly_desc()}</p>
            </div>

            <PlanPrice
              regularPrice={m.pricing_monthly_price()}
              discountPrice={m.pricing_monthly_discount_price()}
              period={m.pricing_monthly_period()}
              discountPeriod={m.pricing_monthly_discount_period()}
            />

            <ul className="space-y-2.5 mb-6 flex-grow">
              {sharedFeatures.map((feature, index) => (
                <PricingFeatureItem key={feature} delay={0.03 * index}>
                  {feature}
                </PricingFeatureItem>
              ))}
              <PricingFeatureItem delay={0.03 * sharedFeatures.length}>
                {m.pricing_monthly_f3()}
              </PricingFeatureItem>
            </ul>

            <CheckoutButton plan="monthly">
              {m.pricing_monthly_cta()}
            </CheckoutButton>
          </motion.div>

          {/* Annual Plan - BEST VALUE */}
          <motion.div
            className="relative p-6 bg-gradient-to-b from-[#06b6d4]/10 to-[#1E1E1E] rounded-2xl border-2 border-[#06b6d4] flex flex-col"
            initial={{ opacity: 0, y: 34 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.55, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
          >
            {/* Badge */}
            <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#06b6d4] text-[#061014] text-xs font-semibold rounded-full shadow-lg">
                <CalendarDays className="w-3.5 h-3.5" />
                {m.pricing_yearly_badge()}
              </div>
            </div>

            <div className="mb-5 mt-1">
              <h3 className="text-lg font-semibold text-white mb-1">{m.pricing_yearly_title()}</h3>
              <p className="text-[#969696] text-sm">{m.pricing_yearly_desc()}</p>
            </div>

            <PlanPrice
              regularPrice={m.pricing_yearly_price()}
              discountPrice={m.pricing_yearly_discount_price()}
              period={m.pricing_yearly_period()}
              discountPeriod={m.pricing_yearly_discount_period()}
              featured
            />

            <ul className="space-y-2.5 mb-6 flex-grow">
              {sharedFeatures.map((feature, index) => (
                <PricingFeatureItem key={feature} delay={0.03 * index}>
                  {feature}
                </PricingFeatureItem>
              ))}
              <PricingFeatureItem delay={0.03 * sharedFeatures.length} emphasis>
                {m.pricing_yearly_f2()}
              </PricingFeatureItem>
              <PricingFeatureItem delay={0.03 * (sharedFeatures.length + 1)} emphasis>
                {m.pricing_yearly_f3()}
              </PricingFeatureItem>
            </ul>

            <CheckoutButton plan="yearly" featured>
              {m.pricing_yearly_cta()}
            </CheckoutButton>
          </motion.div>
        </div>

        <motion.div
          className="mt-10 mx-auto max-w-6xl rounded-2xl border border-[#06b6d4]/20 bg-[#101d20]/70 px-5 py-5 shadow-[0_18px_60px_rgba(0,0,0,0.22)] backdrop-blur sm:px-6"
          initial={{ opacity: 0, y: 22 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.45 }}
          transition={{ duration: 0.5, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(470px,0.72fr)] xl:items-center">
            <div className="flex items-start gap-3">
              <div className="mt-1 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-[#06b6d4]/25 bg-[#06b6d4]/10 text-[#06b6d4]">
                <UsersRound className="h-5 w-5" />
              </div>
              <div>
                <div className="mb-1 inline-flex rounded-full border border-[#06b6d4]/25 bg-[#06b6d4]/10 px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-[#7defff]">
                  {m.pricing_team_badge()}
                </div>
                <h3 className="text-base font-semibold text-white">{m.pricing_team_title()}</h3>
                <p className="mt-1 max-w-2xl text-sm leading-relaxed text-[#a8b2b6]">
                  {m.pricing_team_desc()}
                </p>
              </div>
            </div>

            <div className="grid gap-3 text-sm text-[#d7faff] md:grid-cols-3">
              <span className="inline-flex min-h-16 items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3">
                <ShieldCheck className="h-4 w-4 flex-shrink-0 text-[#06b6d4]" />
                {m.pricing_team_pill_vaults()}
              </span>
              <span className="inline-flex min-h-16 items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3">
                <ServerCog className="h-4 w-4 flex-shrink-0 text-[#06b6d4]" />
                {m.pricing_team_pill_self_hosted()}
              </span>
              <span className="inline-flex min-h-16 items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3">
                <Check className="h-4 w-4 flex-shrink-0 text-[#06b6d4]" />
                {m.pricing_team_pill_e2e()}
              </span>
            </div>
          </div>
        </motion.div>

        {/* Trial Info */}
        <div className="mt-12 text-center">
          <p className="text-[#969696] text-sm">{m.pricing_trial()}</p>
        </div>
      </div>
    </section>
  );
}
