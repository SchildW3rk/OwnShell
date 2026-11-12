import { motion } from 'motion/react';
import {
  Apple,
  Braces,
  ChevronDown,
  Cloud,
  Container,
  Database,
  Download,
  Github,
  KeyRound,
  Terminal,
  Zap,
} from 'lucide-react';
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import * as m from '../paraglide/messages';
import { GITHUB_URL } from '../links';

declare const __OWNSHELL_DESKTOP_VERSION__: string;

interface ReleaseInfo {
  version: string;
  downloads: {
    'mac-arm64': string;
    'mac-x64'?: string;
  };
}

interface ToolBlock {
  label: string;
  detail: string;
  color: string;
  style: CSSProperties;
  rotate: number;
  speed: number;
}

const DESKTOP_VERSION = __OWNSHELL_DESKTOP_VERSION__;
const RELEASE_MANIFEST_URL = '/releases.json';

const FALLBACK: ReleaseInfo = {
  version: DESKTOP_VERSION,
  downloads: {
    'mac-arm64': `https://release.ownshell.app/v${DESKTOP_VERSION}/OwnShell-${DESKTOP_VERSION}-arm64.dmg`,
  },
};

const toolBlocks: ToolBlock[] = [
  {
    label: 'OpenSSH',
    detail: 'terminal',
    color: '#06b6d4',
    style: { left: '6.5%', top: '19%', width: '15rem' },
    rotate: -10,
    speed: 1.35,
  },
  {
    label: 'S3',
    detail: 'cors',
    color: '#06b6d4',
    style: { right: '6.5%', top: '19%', width: '14.5rem' },
    rotate: 9,
    speed: 1.1,
  },
  {
    label: 'SQL',
    detail: 'redis',
    color: '#38bdf8',
    style: { left: '14%', bottom: '-3%', width: '15.5rem' },
    rotate: -8,
    speed: 0.9,
  },
  {
    label: 'Docker',
    detail: 'logs',
    color: '#79a8ff',
    style: { right: '14%', bottom: '-3%', width: '15.5rem' },
    rotate: 8,
    speed: 1.2,
  },
  {
    label: 'Vault',
    detail: '.env',
    color: '#22d3ee',
    style: { left: '7%', top: '54%', width: '15rem' },
    rotate: -5,
    speed: 0.75,
  },
  {
    label: 'API',
    detail: 'rest',
    color: '#60a5fa',
    style: { right: '7%', top: '54%', width: '15rem' },
    rotate: 5,
    speed: 0.85,
  },
];

const heroStats = [
  { icon: Terminal, label: 'native OpenSSH' },
  { icon: Cloud, label: 'S3 + CORS' },
  { icon: Container, label: 'Docker' },
  { icon: Database, label: 'Databases' },
  { icon: Braces, label: 'API client' },
  { icon: KeyRound, label: 'Vault' },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isReleaseDownloadUrl(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('https://release.ownshell.app/');
}

function normalizeReleaseInfo(value: unknown): ReleaseInfo | null {
  if (!isRecord(value) || typeof value.version !== 'string' || !isRecord(value.downloads)) {
    return null;
  }

  const macArm64 = value.downloads['mac-arm64'];
  const macX64 = value.downloads['mac-x64'];

  if (!isReleaseDownloadUrl(macArm64)) {
    return null;
  }

  return {
    version: value.version,
    downloads: {
      'mac-arm64': macArm64,
      ...(isReleaseDownloadUrl(macX64) ? { 'mac-x64': macX64 } : {}),
    },
  };
}

function HeroToolBlock({ block, index }: { block: ToolBlock; index: number }) {
  return (
    <motion.div
      className="hero-tool-block hidden sm:block"
      style={
        {
          ...block.style,
          '--hero-tool-accent': block.color,
          rotate: `${block.rotate}deg`,
        } as CSSProperties
      }
      initial={{ opacity: 0, y: 18, scale: 0.96 }}
      animate={{
        opacity: 0.72,
        y: [0, -14, 0],
        rotate: [
          `${block.rotate}deg`,
          `${block.rotate + (index % 2 === 0 ? 2 : -2)}deg`,
          `${block.rotate}deg`,
        ],
      }}
      transition={{
        opacity: { duration: 0.65, delay: 0.18 + index * 0.04 },
        y: { duration: 5.8 / block.speed, repeat: Infinity, ease: 'easeInOut' },
        rotate: { duration: 7.4 / block.speed, repeat: Infinity, ease: 'easeInOut' },
      }}
      aria-hidden="true"
    >
      <span>{block.label}</span>
      <small>{block.detail}</small>
    </motion.div>
  );
}

function MotionIn({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 22 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.72, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

export function Hero() {
  const [showMacDropdown, setShowMacDropdown] = useState(false);
  const [release, setRelease] = useState<ReleaseInfo>(FALLBACK);

  useEffect(() => {
    let mounted = true;

    fetch(RELEASE_MANIFEST_URL, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: unknown) => {
        const nextRelease = normalizeReleaseInfo(payload);
        if (mounted && nextRelease) {
          setRelease(nextRelease);
        }
      })
      .catch(() => undefined);

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <section
      id="download"
      className="relative min-h-screen overflow-hidden border-b border-[#2b2b2e] px-4 pt-28 pb-16"
    >
      <div className="hero-bg" aria-hidden="true">
        <div className="hero-bg__grid" />
        <div className="hero-bg__glow hero-bg__glow--left" />
        <div className="hero-bg__glow hero-bg__glow--right" />
        {toolBlocks.map((block, index) => (
          <HeroToolBlock key={block.label} block={block} index={index} />
        ))}
      </div>
      <div className="hero-vignette" />
      <div className="hero-noise" />

      <div className="relative z-10 mx-auto flex min-h-[calc(100vh-11rem)] max-w-6xl flex-col items-center justify-center text-center">
        <MotionIn>
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#06b6d4]/30 bg-[#06b6d4]/10 px-3 py-1.5 text-sm font-medium text-[#06b6d4] shadow-[0_0_38px_rgba(6,182,212,0.16)]">
            <Zap className="h-4 w-4" />
            {m.hero_badge()}
          </div>
        </MotionIn>

        <MotionIn delay={0.08}>
          <h1 className="mx-auto max-w-4xl text-4xl font-extrabold leading-tight text-white sm:text-5xl lg:text-6xl">
            {m.hero_title_1()} <span className="text-[#06b6d4]">{m.hero_title_2()}</span>
          </h1>
        </MotionIn>

        <MotionIn delay={0.16}>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-[#b8b8b8] sm:text-xl">
            {m.hero_subtitle()}
          </p>
        </MotionIn>

        <MotionIn delay={0.24} className="mt-9 flex flex-col items-center gap-4">
          <div className="flex w-full flex-col items-stretch gap-3 sm:w-auto sm:flex-row sm:items-center">
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowMacDropdown(!showMacDropdown)}
                onBlur={() => setTimeout(() => setShowMacDropdown(false), 150)}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#06b6d4] px-6 py-3 font-semibold text-[#061014] transition-colors hover:bg-[#38d5ee] sm:w-auto"
              >
                <Apple className="h-5 w-5" />
                macOS
                <ChevronDown className="h-4 w-4" />
              </button>

              {showMacDropdown && (
                <div className="absolute left-1/2 top-full z-50 mt-2 w-56 -translate-x-1/2 rounded-lg border border-[#3E3E42] bg-[#171717] shadow-2xl">
                  <a
                    href={release.downloads['mac-arm64']}
                    className={`flex items-center gap-2 px-4 py-3 text-[#d6d6d6] transition-colors hover:bg-[#252526] ${
                      release.downloads['mac-x64'] ? 'rounded-t-lg' : 'rounded-lg'
                    }`}
                  >
                    <Download className="h-4 w-4" />
                    Apple Silicon
                  </a>
                  {release.downloads['mac-x64'] && (
                    <a
                      href={release.downloads['mac-x64']}
                      className="flex items-center gap-2 rounded-b-lg border-t border-[#3E3E42] px-4 py-3 text-[#d6d6d6] transition-colors hover:bg-[#252526]"
                    >
                      <Download className="h-4 w-4" />
                      Intel
                    </a>
                  )}
                </div>
              )}
            </div>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/[0.04] px-6 py-3 font-semibold text-[#e6e6e6] transition-colors hover:border-[#06b6d4]/60 hover:text-white"
            >
              <Github className="h-5 w-5" />
              {m.hero_cta_github()}
            </a>
          </div>

          <p className="text-sm text-[#969696]">
            v{release.version} · {m.hero_platform()}
            {release.downloads['mac-x64'] ? ' & Intel' : ''}
          </p>
        </MotionIn>

        <MotionIn
          delay={0.32}
          className="mt-14 grid w-full max-w-4xl grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6"
        >
          {heroStats.map((stat) => (
            <div
              key={stat.label}
              className="flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-[#111113]/60 px-3 py-2 text-sm text-[#cfcfcf] backdrop-blur-md"
            >
              <stat.icon className="h-4 w-4 text-[#06b6d4]" />
              <span>{stat.label}</span>
            </div>
          ))}
        </MotionIn>
      </div>
    </section>
  );
}
