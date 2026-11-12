import { Shield, Lock, HardDrive, WifiOff, EyeOff } from 'lucide-react';
import { motion } from 'motion/react';
import * as m from '../paraglide/messages';

export function Security() {
  const securityFeatures = [
    {
      icon: Lock,
      title: m.security_encryption_title(),
      description: m.security_encryption_desc(),
    },
    {
      icon: HardDrive,
      title: m.security_local_title(),
      description: m.security_local_desc(),
    },
    {
      icon: EyeOff,
      title: m.security_opensource_title(),
      description: m.security_opensource_desc(),
    },
    {
      icon: WifiOff,
      title: m.security_nocall_title(),
      description: m.security_nocall_desc(),
    },
  ];

  return (
    <section id="security" className="relative overflow-hidden py-24 px-4 bg-[#0d0d12]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_50%,rgba(6,182,212,0.10),transparent_28rem)]" />
      <div className="max-w-6xl mx-auto">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <motion.div
            className="relative flex items-center justify-center"
            initial={{ opacity: 0, x: -46, rotate: -3 }}
            whileInView={{ opacity: 1, x: 0, rotate: 0 }}
            viewport={{ once: true, amount: 0.45 }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          >
            <motion.div
              className="absolute w-80 h-80 rounded-full bg-[#06b6d4]/18 blur-3xl"
              animate={{ scale: [1, 1.08, 1], opacity: [0.45, 0.72, 0.45] }}
              transition={{ duration: 5.8, repeat: Infinity, ease: 'easeInOut' }}
            />

            <motion.div
              className="absolute w-64 h-64 rounded-full border border-[#06b6d4]/24"
              animate={{ rotate: 360 }}
              transition={{ duration: 28, repeat: Infinity, ease: 'linear' }}
            />

            <motion.div
              className="absolute w-48 h-48 rounded-full border border-[#06b6d4]/35"
              animate={{ scale: [0.97, 1.03, 0.97] }}
              transition={{ duration: 4.6, repeat: Infinity, ease: 'easeInOut' }}
            />

            <div className="relative w-40 h-40 bg-gradient-to-br from-[#14181a] to-[#252526] rounded-2xl border border-[#06b6d4]/35 flex items-center justify-center shadow-[0_28px_90px_rgba(6,182,212,0.16)]">
              <div className="absolute inset-0 bg-[#06b6d4]/6 rounded-2xl" />
              <Shield className="w-20 h-20 text-[#06b6d4]" />
              <motion.div
                className="absolute -bottom-3 -right-3 w-12 h-12 bg-[#101113] rounded-xl border border-[#06b6d4]/40 flex items-center justify-center"
                initial={{ opacity: 0, x: -18, y: 10 }}
                whileInView={{ opacity: 1, x: 0, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: 0.35, ease: [0.22, 1, 0.36, 1] }}
              >
                <Lock className="w-6 h-6 text-[#06b6d4]" />
              </motion.div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 34 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.35 }}
            transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#06b6d4]/10 border border-[#06b6d4]/30 text-[#06b6d4] text-sm font-medium mb-6">
              <Shield className="w-4 h-4" />
              {m.security_badge()}
            </div>

            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">{m.security_title()}</h2>
            <p className="text-lg text-[#969696] mb-8 leading-relaxed">{m.security_subtitle()}</p>

            <div className="grid sm:grid-cols-2 gap-4">
              {securityFeatures.map((feature, index) => (
                <motion.div
                  key={index}
                  className="p-4 bg-[#141416]/70 rounded-xl border border-[#3E3E42]/50"
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.4 }}
                  transition={{ duration: 0.45, delay: 0.08 * index, ease: [0.22, 1, 0.36, 1] }}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-[#06b6d4]/10 flex items-center justify-center flex-shrink-0">
                      <feature.icon className="w-5 h-5 text-[#06b6d4]" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-white mb-1">{feature.title}</h3>
                      <p className="text-sm text-[#969696]">{feature.description}</p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
