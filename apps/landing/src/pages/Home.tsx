import { Header } from '../components/Header';
import { Hero } from '../components/Hero';
import { Features } from '../components/Features';
import { Security } from '../components/Security';
import { Pricing } from '../components/Pricing';
import { Footer } from '../components/Footer';

export function Home() {
  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      <Header />
      <main className="pt-16">
        <Hero />
        <Features />
        <Security />
        <Pricing />
      </main>
      <Footer />
    </div>
  );
}
