import {
  Braces,
  Cloud,
  Container,
  Database,
  KeyRound,
  Terminal,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { motion, useScroll, useTransform, type MotionStyle, type MotionValue } from 'motion/react';
import { useRef, type CSSProperties } from 'react';
import * as m from '../paraglide/messages';

interface Capability {
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  description: string;
  bullets: string[];
  accent: string;
  command: string;
}

const CARD_COUNT = 6;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function CapabilityCard({
  capability,
  index,
  progress,
}: {
  capability: Capability;
  index: number;
  progress: MotionValue<number>;
}) {
  const Icon = capability.icon;
  const center = index / (CARD_COUNT - 1);
  const side = index % 2 === 0 ? -1 : 1;
  const opacity = useTransform(progress, (latest) => {
    const distance = Math.abs(latest - center);
    const closeness = clamp(1 - distance / 0.115, 0, 1);
    return Number(Math.pow(closeness, 1.35).toFixed(3));
  });
  const scale = useTransform(progress, (latest) => {
    const distance = Math.abs(latest - center);
    return 0.92 + clamp(1 - distance / 0.16, 0, 1) * 0.08;
  });
  const y = useTransform(progress, (latest) => clamp((latest - center) * -620, -86, 86));
  const x = useTransform(progress, (latest) => side * clamp((latest - center) * -140, -22, 22));
  const rotateX = useTransform(progress, (latest) => clamp((latest - center) * -38, -5, 5));
  const rotateY = useTransform(progress, (latest) => side * clamp((latest - center) * -34, -6, 6));
  const zIndex = useTransform(progress, (latest) => Math.round(100 - Math.abs(latest - center) * 100));
  const cardStyle = {
    '--card-accent': capability.accent,
    scale,
    opacity,
    x,
    y,
    rotateX,
    rotateY,
    zIndex,
  } as MotionStyle & { '--card-accent': string };

  return (
    <motion.article
      className="capability-card"
      style={cardStyle}
    >
      <div className="capability-card__topline">
        <span>{capability.eyebrow}</span>
        <span>0{index + 1}</span>
      </div>

      <div className="mb-6 flex items-start justify-between gap-6">
        <div className="capability-card__icon">
          <Icon className="h-6 w-6" />
        </div>
        <code className="capability-card__command">{capability.command}</code>
      </div>

      <h3 className="mb-3 text-2xl font-semibold text-white sm:text-3xl">{capability.title}</h3>
      <p className="mb-6 leading-relaxed text-[#b8b8b8]">{capability.description}</p>

      <ul className="grid gap-2 sm:grid-cols-3">
        {capability.bullets.map((bullet) => (
          <li key={bullet} className="capability-card__bullet">
            {bullet}
          </li>
        ))}
      </ul>
    </motion.article>
  );
}

export function Features() {
  const sectionRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start start', 'end end'],
  });

  const sceneRotate = useTransform(scrollYProgress, [0, 1], [8, -8]);
  const sceneY = useTransform(scrollYProgress, [0, 1], [34, -34]);
  const railGlow = useTransform(scrollYProgress, [0, 0.5, 1], [0.22, 0.58, 0.22]);
  const sceneOpacity = useTransform(railGlow, (value) => 0.88 + value * 0.12);

  const capabilities: Capability[] = [
    {
      icon: Terminal,
      eyebrow: 'OpenSSH',
      title: m.feature_ssh_title(),
      description: m.feature_ssh_desc(),
      bullets: [m.feature_ssh_f1(), m.feature_ssh_f2(), m.feature_ssh_f3()],
      accent: '#06b6d4',
      command: 'ssh prod-web-01',
    },
    {
      icon: Cloud,
      eyebrow: 'Storage',
      title: m.feature_storage_title(),
      description: m.feature_storage_desc(),
      bullets: [m.feature_storage_f1(), m.feature_storage_f2(), m.feature_storage_f3()],
      accent: '#06b6d4',
      command: 'cors apply s3://assets',
    },
    {
      icon: Database,
      eyebrow: 'Data',
      title: m.feature_db_title(),
      description: m.feature_db_desc(),
      bullets: [m.feature_db_f1(), m.feature_db_f2(), m.feature_db_f3()],
      accent: '#38bdf8',
      command: 'select * from deployments',
    },
    {
      icon: Container,
      eyebrow: 'Runtime',
      title: m.feature_docker_title(),
      description: m.feature_docker_desc(),
      bullets: [m.feature_docker_f1(), m.feature_docker_f2(), m.feature_docker_f3()],
      accent: '#79a8ff',
      command: 'docker compose logs -f',
    },
    {
      icon: Braces,
      eyebrow: 'Requests',
      title: m.feature_api_title(),
      description: m.feature_api_desc(),
      bullets: [m.feature_api_f1(), m.feature_api_f2(), m.feature_api_f3()],
      accent: '#60a5fa',
      command: 'post /v1/deployments',
    },
    {
      icon: KeyRound,
      eyebrow: 'Vault',
      title: m.feature_vault_title(),
      description: m.feature_vault_desc(),
      bullets: [m.feature_vault_f1(), m.feature_vault_f2(), m.feature_vault_f3()],
      accent: '#22d3ee',
      command: 'vault push .env.production',
    },
  ];

  return (
    <section id="features" ref={sectionRef} className="feature-flight px-4">
      <div className="feature-flight__sticky">
        <div className="feature-flight__layout mx-auto grid w-full max-w-7xl gap-16 lg:items-center">
          <motion.div
            className="feature-flight__intro lg:max-w-[420px]"
            initial={{ opacity: 0, y: 32 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.35 }}
            transition={{ duration: 0.72, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#06b6d4]/30 bg-[#06b6d4]/10 px-3 py-1.5 text-sm font-medium text-[#06b6d4]">
              <Zap className="h-4 w-4" />
              {m.features_badge()}
            </div>
            <h2 className="text-3xl font-bold leading-tight text-white sm:text-4xl lg:text-5xl">
              {m.features_title()}
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-[#a9a9a9]">{m.features_subtitle()}</p>
          </motion.div>

          <motion.div
            className="capability-scene"
            style={{
              y: sceneY,
              rotateY: sceneRotate,
              opacity: sceneOpacity,
            }}
          >
            <div className="capability-scene__grid" />
            <div className="capability-scene__rail">
              {capabilities.map((capability, index) => (
                <CapabilityCard
                  key={capability.title}
                  capability={capability}
                  index={index}
                  progress={scrollYProgress}
                />
              ))}
            </div>
          </motion.div>

          <div className="feature-flight__mobile-list">
            {capabilities.map((capability, index) => (
              <MobileCapabilityCard key={capability.title} capability={capability} index={index} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function MobileCapabilityCard({
  capability,
  index,
}: {
  capability: Capability;
  index: number;
}) {
  const Icon = capability.icon;

  return (
    <motion.div
      className="capability-card capability-card--mobile"
      style={{ '--card-accent': capability.accent } as CSSProperties}
      initial={{ opacity: 0, y: 42 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.25 }}
      transition={{ duration: 0.55, delay: index * 0.04, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="capability-card__topline">
        <span>{capability.eyebrow}</span>
        <span>0{index + 1}</span>
      </div>
      <div className="capability-card__icon mb-5">
        <Icon className="h-6 w-6" />
      </div>
      <h3 className="mb-3 text-2xl font-semibold text-white">{capability.title}</h3>
      <p className="mb-5 leading-relaxed text-[#b8b8b8]">{capability.description}</p>
      <ul className="space-y-2">
        {capability.bullets.map((bullet) => (
          <li key={bullet} className="capability-card__bullet">
            {bullet}
          </li>
        ))}
      </ul>
    </motion.div>
  );
}
