import React from 'react';
import { LandingLayout } from '@/components/layout/LandingLayout';
import { motion } from 'framer-motion';
import { Link } from 'wouter';
import { Terminal, Shield, Zap, Search, Lock, Code2, ArrowRight } from 'lucide-react';

// You can swap this for the generated image once available
import heroBg from '@assets/hero-bg.jpg';

export default function LandingPage() {
  return (
    <LandingLayout>
      {/* Hero Section */}
      <section className="relative overflow-hidden border-b border-border/50">
        <div className="absolute inset-0 bg-grid-white/[0.02] bg-[size:32px_32px] pointer-events-none" />
        <div className="absolute inset-0 bg-background/80" />
        <div 
          className="absolute inset-0 opacity-20 dark:opacity-40 mix-blend-screen pointer-events-none"
          style={{ backgroundImage: `url('/attached_assets/generated_images/hero-bg.jpg')`, backgroundSize: 'cover', backgroundPosition: 'center' }}
        />
        
        <div className="container mx-auto px-6 pt-32 pb-40 relative z-10">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="max-w-4xl"
          >
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-mono mb-8">
              <span className="size-2 rounded-full bg-primary animate-pulse" />
              v2.0 Beta Now Available
            </div>
            <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-8 leading-[1.1]">
              Surgical precision for <br/>
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-cyan-400">
                codebase intelligence.
              </span>
            </h1>
            <p className="text-xl text-muted-foreground mb-10 max-w-2xl leading-relaxed">
              BlackMap Recon is the premium static analysis and vulnerability scanning platform built for modern security engineering teams. Know exactly what's in your code.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4">
              <Link href="/dashboard" className="inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground h-12 px-8 rounded-md font-medium hover:bg-primary/90 transition-colors" data-testid="hero-cta-start">
                Start Scanning <ArrowRight className="size-4" />
              </Link>
              <a href="#features" className="inline-flex items-center justify-center gap-2 bg-muted/50 text-foreground border border-border h-12 px-8 rounded-md font-medium hover:bg-muted transition-colors" data-testid="hero-cta-docs">
                <Terminal className="size-4" /> Documentation
              </a>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="py-32 relative">
        <div className="container mx-auto px-6">
          <div className="mb-20">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Uncompromising Analysis</h2>
            <p className="text-muted-foreground text-lg max-w-2xl">Built from the ground up to handle massive mono-repos and complex microservices with near-zero false positives.</p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8">
            <FeatureCard 
              icon={Search}
              title="Deep Static Analysis"
              description="Our proprietary engine traces data flow across thousands of files to find vulnerabilities that pattern-matching misses."
              delay={0.1}
            />
            <FeatureCard 
              icon={Zap}
              title="Sub-second Scanning"
              description="Written in Rust for maximum performance. Scan entire enterprise codebases in the time it takes to fetch coffee."
              delay={0.2}
            />
            <FeatureCard 
              icon={Lock}
              title="Zero-Knowledge Design"
              description="Your code never leaves your VPC if you don't want it to. Fully self-hostable with enterprise-grade audit logging."
              delay={0.3}
            />
          </div>
        </div>
      </section>
      
      {/* CLI preview section */}
      <section className="py-24 bg-muted/10 border-y border-border/50">
        <div className="container mx-auto px-6 flex flex-col lg:flex-row items-center gap-16">
          <div className="lg:w-1/2">
            <h2 className="text-3xl font-bold mb-6">Works where you do.</h2>
            <p className="text-muted-foreground mb-8 text-lg">Integrate BlackMap directly into your CI/CD pipeline or use our CLI tool for local developer workstations.</p>
            <ul className="space-y-4">
              {[
                "Native GitHub Actions & GitLab CI support",
                "Pre-commit hooks for developers",
                "Rich SARIF output for standard tooling",
                "Automated PR review comments"
              ].map((item, i) => (
                <li key={i} className="flex items-center gap-3">
                  <div className="size-5 rounded-full bg-primary/20 flex items-center justify-center">
                    <Code2 className="size-3 text-primary" />
                  </div>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="lg:w-1/2 w-full">
            <div className="rounded-lg border border-border bg-card shadow-2xl overflow-hidden">
              <div className="h-10 bg-muted border-b border-border flex items-center px-4 gap-2">
                <div className="size-3 rounded-full bg-red-500/80" />
                <div className="size-3 rounded-full bg-yellow-500/80" />
                <div className="size-3 rounded-full bg-green-500/80" />
                <div className="ml-4 font-mono text-xs text-muted-foreground">terminal</div>
              </div>
              <div className="p-6 font-mono text-sm leading-relaxed overflow-x-auto">
                <div className="text-muted-foreground">$ blackmap scan ./backend --ci</div>
                <div className="mt-2 text-foreground">Initializing scan engines...</div>
                <div className="text-primary mt-1">[OK] Loaded 4,281 rules</div>
                <div className="mt-4 text-foreground">Scanning 1,402 files...</div>
                <div className="text-muted-foreground">Progress: [====================] 100%</div>
                <div className="mt-4 border-t border-border/50 pt-4">
                  <div className="text-destructive font-bold">1 Critical vulnerability found</div>
                  <div className="text-foreground mt-2">→ Hardcoded AWS Credentials</div>
                  <div className="text-muted-foreground ml-4">src/config/aws.ts:42</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
      
      {/* CTA Section */}
      <section className="py-32">
        <div className="container mx-auto px-6 text-center">
          <h2 className="text-4xl font-bold mb-6">Ready to secure your stack?</h2>
          <p className="text-xl text-muted-foreground mb-10 max-w-2xl mx-auto">Join the teams that trust BlackMap to protect their infrastructure.</p>
          <Link href="/dashboard" className="inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground h-14 px-10 rounded-md font-medium text-lg hover:bg-primary/90 transition-colors" data-testid="footer-cta">
            Start Free Trial
          </Link>
        </div>
      </section>
    </LandingLayout>
  );
}

function FeatureCard({ icon: Icon, title, description, delay }: { icon: any, title: string, description: string, delay: number }) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-100px" }}
      transition={{ duration: 0.5, delay }}
      className="p-8 rounded-xl border border-border bg-card hover:border-primary/50 transition-colors group"
    >
      <div className="size-12 rounded-lg bg-primary/10 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
        <Icon className="size-6 text-primary" />
      </div>
      <h3 className="text-xl font-bold mb-3">{title}</h3>
      <p className="text-muted-foreground leading-relaxed">{description}</p>
    </motion.div>
  );
}
