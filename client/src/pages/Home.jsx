import React from "react";
import { NavLink } from "react-router-dom";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { TargetIcon, ShieldIcon, PackageIcon, DropletIcon, ClockIcon, LockIcon, LightningIcon, GlobeIcon } from "../components/common/Icons";

const Home = ({ account }) => {
  const features = [
    {
      title: "Dutch Auction",
      description: "Commit-reveal price discovery mechanism ensures fair and transparent token pricing through sealed bids.",
      icon: TargetIcon,
      color: "primary",
    },
    {
      title: "Merkle Whitelist",
      description: "Optional access control with efficient Merkle tree verification for early participants.",
      icon: LockIcon,
      color: "primary",
    },
    {
      title: "IPFS Integration",
      description: "Decentralized storage for whitelist Merkle roots and bonus token allocations via IPFS, ensuring immutable and verifiable data.",
      icon: PackageIcon,
      color: "secondary",
    },
    {
      title: "Liquidity Bootstrapping Pool",
      description: "Dynamic price discovery through weighted AMM pools that gradually shift token distribution.",
      icon: DropletIcon,
      color: "secondary",
    },
    {
      title: "Vesting & Distribution",
      description: "Automated token vesting with configurable cliffs and linear release schedules.",
      icon: ClockIcon,
      color: "primary",
    },
    {
      title: "Security & Trustless",
      description: "Non-custodial design with auditable smart contracts and transparent on-chain operations.",
      icon: ShieldIcon,
      color: "primary",
    },
  ];

  const steps = [
    {
      number: "01",
      title: "Create Auction",
      description: "Project creators deploy a presale with configurable parameters including token supply, price range, and whitelist settings.",
    },
    {
      number: "02",
      title: "Commit-Reveal",
      description: "Participants submit sealed bids during the commit phase, then reveal their commitments to determine the clearing price.",
    },
    {
      number: "03",
      title: "Price Discovery",
      description: "The auction mechanism calculates the fair market price based on revealed commitments and demand.",
    },
    {
      number: "04",
      title: "LBP",
      description: "Successful auction proceeds flow into a Liquidity Bootstrapping Pool for continuous price discovery and trading.",
    },
    {
      number: "05",
      title: "Vesting",
      description: "Allocated tokens are automatically distributed through vesting contracts with customizable release schedules.",
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      
      <section className="relative min-h-[90vh] flex items-center justify-center overflow-hidden">
        
        <div className="absolute inset-0 bg-background">
          
          <div className="absolute -top-40 -right-40 h-96 w-96 rounded-full bg-primary/20 blur-3xl"></div>
          <div className="absolute -bottom-40 -left-40 h-96 w-96 rounded-full bg-secondary/15 blur-3xl"></div>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[600px] w-[600px] rounded-full bg-primary/10 blur-3xl"></div>
          
          
          <div className="absolute top-1/4 right-1/4 h-64 w-64 rounded-full bg-indigo-500/10 blur-2xl"></div>
          <div className="absolute bottom-1/4 left-1/4 h-64 w-64 rounded-full bg-teal-500/10 blur-2xl"></div>
        </div>

        
        <div className="absolute inset-0 bg-[linear-gradient(rgba(99,102,241,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(99,102,241,0.05)_1px,transparent_1px)] bg-[size:3rem_3rem] [mask-image:radial-gradient(ellipse_100%_60%_at_50%_0%,#000_40%,transparent_100%)]"></div>
        
        
        <div className="absolute top-20 left-20 h-2 w-2 rounded-full bg-primary/60 blur-sm animate-pulse"></div>
        <div className="absolute top-40 right-32 h-1.5 w-1.5 rounded-full bg-secondary/60 blur-sm animate-pulse" style={{ animationDelay: '1s' }}></div>
        <div className="absolute bottom-32 left-1/3 h-2 w-2 rounded-full bg-primary/40 blur-sm animate-pulse" style={{ animationDelay: '2s' }}></div>

        <div className="container relative z-10 mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-4xl text-center">
            
            <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-2 text-xs font-medium text-primary backdrop-blur-sm sm:text-sm">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75"></span>
                <span className="relative inline-flex h-2 w-2 rounded-full bg-primary"></span>
              </span>
              Secure Token Presale Protocol
            </div>

            
            <h1 className="mb-6 text-5xl font-black leading-[1.1] tracking-tight text-text sm:text-6xl lg:text-7xl">
              STPP
              <span className="block mt-2 bg-gradient-to-r from-primary via-indigo-400 to-secondary bg-clip-text text-transparent">
                dApp
              </span>
            </h1>

            
            <p className="mb-4 text-xl font-semibold text-text sm:text-2xl lg:text-3xl">
              Decentralized token launchpad
            </p>
            <p className="mb-8 text-lg text-text-muted sm:text-xl">
              with fair price discovery
            </p>

            
            <p className="mx-auto mb-12 max-w-2xl text-base leading-relaxed text-text-muted sm:text-lg">
              STPP enables secure, transparent, and trustless token presales through Dutch auctions, 
              liquidity bootstrapping pools, and automated vesting—all on-chain.
            </p>

            
            <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
              <NavLink
                to="/all"
                className="group relative inline-flex items-center gap-2 overflow-hidden rounded-lg bg-primary px-8 py-4 text-base font-semibold text-white shadow-lg shadow-primary/25 transition-all duration-300 hover:scale-105 hover:shadow-xl hover:shadow-primary/40"
              >
                <span>Explore Presales</span>
                <svg className="h-5 w-5 transition-transform duration-300 group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </NavLink>
              {!account && (
                <div className="rounded-lg border border-border/50 bg-surface/30 px-6 py-4 backdrop-blur-sm transition-all duration-300 hover:border-primary/50 hover:bg-surface/50">
                  <ConnectButton showBalance={false} chainStatus="icon" />
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      
      <section className="relative py-20 sm:py-32">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-16 text-center">
            <h2 className="mb-4 text-4xl font-bold text-text sm:text-5xl">
              Core Features
            </h2>
            <p className="mx-auto max-w-2xl text-lg text-text-muted">
              A comprehensive protocol designed for secure and fair token launches
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature, index) => (
              <div
                key={index}
                className="group relative overflow-hidden rounded-2xl border border-border/30 bg-surface/60 p-8 transition-all duration-500 hover:scale-[1.03] hover:border-primary/50 hover:bg-surface/80 hover:shadow-2xl hover:shadow-primary/25"
              >
                
                <div className={`absolute inset-0 opacity-60 transition-opacity duration-500 group-hover:opacity-100 ${
                  feature.color === 'primary' 
                    ? 'bg-gradient-to-br from-primary/10 via-primary/5 to-transparent' 
                    : 'bg-gradient-to-br from-secondary/10 via-secondary/5 to-transparent'
                }`}></div>
                
                
                <div className={`relative mb-6 inline-flex h-20 w-20 items-center justify-center rounded-2xl transition-all duration-500 group-hover:scale-110 group-hover:rotate-3 ${
                  feature.color === 'primary' 
                    ? 'bg-primary/20 shadow-lg shadow-primary/30 group-hover:bg-primary/25 group-hover:shadow-primary/40' 
                    : 'bg-secondary/20 shadow-lg shadow-secondary/30 group-hover:bg-secondary/25 group-hover:shadow-secondary/40'
                }`}>
                  {React.createElement(feature.icon, { className: "h-10 w-10 text-current" })}
                  
                  <div className={`absolute inset-0 rounded-2xl opacity-30 blur-xl transition-opacity duration-500 group-hover:opacity-50 ${
                    feature.color === 'primary' ? 'bg-primary' : 'bg-secondary'
                  }`}></div>
                </div>
                
                <h3 className="relative mb-4 text-2xl font-bold text-text">
                  {feature.title}
                </h3>
                <p className="relative text-base leading-relaxed text-text-muted">
                  {feature.description}
                </p>
                
                
                <div className={`absolute bottom-0 left-0 h-1.5 w-full transition-all duration-700 ${
                  feature.color === 'primary' 
                    ? 'bg-gradient-to-r from-primary via-indigo-500 to-primary' 
                    : 'bg-gradient-to-r from-secondary via-teal-500 to-secondary'
                }`}></div>
                
                
                <div className={`absolute -right-8 -top-8 h-32 w-32 rounded-full opacity-15 blur-2xl transition-opacity duration-500 group-hover:opacity-30 ${
                  feature.color === 'primary' ? 'bg-primary' : 'bg-secondary'
                }`}></div>
                
                
                <div className={`absolute -bottom-8 -left-8 h-24 w-24 rounded-full opacity-10 blur-xl transition-opacity duration-500 group-hover:opacity-20 ${
                  feature.color === 'primary' ? 'bg-primary' : 'bg-secondary'
                }`}></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      
      <section className="relative overflow-hidden border-t border-border/30 bg-gradient-to-b from-background via-surface/10 to-background py-24 sm:py-32">
        
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(99,102,241,0.05),transparent_70%)]"></div>
          <div className="absolute left-0 top-1/2 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/5 blur-3xl"></div>
          <div className="absolute right-0 top-1/2 h-96 w-96 translate-x-1/2 -translate-y-1/2 rounded-full bg-secondary/5 blur-3xl"></div>
        </div>
        
        <div className="container relative mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-20 text-center">
            <h2 className="mb-4 text-4xl font-bold text-text sm:text-5xl lg:text-6xl">
              How It Works
            </h2>
            <p className="mx-auto max-w-2xl text-lg text-text-muted sm:text-xl">
              A streamlined process from auction creation to token distribution
            </p>
          </div>

          <div className="mx-auto max-w-7xl">
            <div className="relative">
              
              <div className="absolute left-0 top-20 hidden h-0.5 w-full lg:block">
                <div className="mx-auto h-full max-w-6xl">
                  <div className="h-full w-full bg-gradient-to-r from-primary/60 via-primary/40 to-primary/60"></div>
                </div>
              </div>

              
              <div className="absolute left-0 top-18 hidden w-full lg:block">
                <div className="mx-auto flex max-w-6xl justify-between px-4">
                  {steps.map((_, index) => (
                    <div key={index} className="relative">
                      <div className="h-4 w-4 rounded-full bg-primary border-2 border-primary/80 shadow-lg shadow-primary/30"></div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-5 lg:items-stretch">
                {steps.map((step, index) => (
                  <div key={index} className="relative z-10 flex flex-col">
                    
                    {index < steps.length - 1 && (
                      <div className="absolute right-0 top-20 hidden h-0.5 w-full translate-x-1/2 lg:block">
                        <div className="h-full bg-gradient-to-r from-primary/60 to-transparent"></div>
                        <div className="absolute right-0 top-1/2 h-2 w-2 -translate-y-1/2 translate-x-1/2 rotate-45 border-r-2 border-b-2 border-primary"></div>
                      </div>
                    )}

                    <div className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-border/50 bg-surface/80 p-7 backdrop-blur-sm transition-all duration-500 hover:scale-[1.05] hover:border-primary/60 hover:bg-surface hover:shadow-xl hover:shadow-primary/30">
                      
                      <div className="absolute inset-0 bg-gradient-to-br from-primary/8 via-transparent to-transparent opacity-50 transition-opacity duration-500 group-hover:opacity-80"></div>
                      
                      
                      <div className="absolute -right-4 -top-4 h-20 w-20 rounded-full bg-primary/8 blur-2xl opacity-30 transition-opacity duration-500 group-hover:opacity-50"></div>
                      
                      
                      <div className="relative mb-5 flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 text-xl font-bold text-primary shadow-lg shadow-primary/25 transition-all duration-500 group-hover:scale-110 group-hover:shadow-xl group-hover:shadow-primary/40">
                        {step.number}
                        
                        <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-white/20 to-transparent"></div>
                        
                        <div className="absolute -inset-1 rounded-xl bg-primary/15 blur-md opacity-60"></div>
                      </div>

                      <h3 className="relative mb-3 text-lg font-bold text-text sm:text-xl">
                        {step.title}
                      </h3>
                      <p className="relative flex-1 text-sm leading-relaxed text-text-muted">
                        {step.description}
                      </p>
                      
                      
                      <div className="absolute bottom-0 left-0 h-1 w-full bg-gradient-to-r from-primary via-indigo-500 to-secondary"></div>
                    </div>

                    
                    {index < steps.length - 1 && (
                      <div className="flex items-center justify-center py-6 lg:hidden">
                        <div className="relative">
                          <div className="h-12 w-0.5 bg-gradient-to-b from-primary/50 to-transparent"></div>
                          <div className="absolute top-0 left-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/40 border border-primary/60"></div>
                          <svg className="absolute top-3 left-1/2 h-5 w-5 -translate-x-1/2 text-primary/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      
      <section className="relative overflow-hidden border-t border-border/30 bg-gradient-to-b from-background via-surface/10 to-background py-24 sm:py-32">
        
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(99,102,241,0.04),transparent_70%)]"></div>
          <div className="absolute left-1/4 top-1/4 h-64 w-64 rounded-full bg-primary/5 blur-3xl"></div>
          <div className="absolute right-1/4 bottom-1/4 h-64 w-64 rounded-full bg-secondary/5 blur-3xl"></div>
        </div>

        <div className="container relative mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-5xl">
            <div className="mb-20 text-center">
              <h2 className="mb-4 text-4xl font-bold text-text sm:text-5xl lg:text-6xl">
                Built for Trust
              </h2>
              <p className="mx-auto max-w-2xl text-lg text-text-muted sm:text-xl">
                Security and transparency are at the core of our protocol
              </p>
            </div>

            <div className="grid gap-8 sm:grid-cols-2 sm:items-stretch">
              <div className="group relative flex flex-col overflow-hidden rounded-2xl border border-border/40 bg-gradient-to-br from-surface/70 to-surface/50 p-10 backdrop-blur-sm transition-all duration-500 hover:scale-[1.03] hover:border-primary/60 hover:from-surface/90 hover:to-surface/70 hover:shadow-2xl hover:shadow-primary/30">
                
                <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-transparent opacity-60 transition-opacity duration-500 group-hover:opacity-100"></div>
                
                
                <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-primary/12 blur-2xl opacity-40 transition-opacity duration-500 group-hover:opacity-60"></div>
                
                
                <div className="relative mb-6 inline-flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-primary/10 shadow-lg shadow-primary/25 transition-all duration-500 group-hover:scale-110 group-hover:shadow-xl group-hover:shadow-primary/40">
                  <LockIcon className="h-10 w-10 text-current" />
                  <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-white/20 to-transparent"></div>
                  <div className="absolute -inset-1 rounded-2xl bg-primary/15 blur-md opacity-60"></div>
                </div>
                
                <h3 className="relative mb-4 text-2xl font-bold text-text">
                  Non-Custodial Design
                </h3>
                <p className="relative flex-1 text-base leading-relaxed text-text-muted">
                  Your funds and tokens remain in your control. Smart contracts handle all operations 
                  without requiring trust in a central authority.
                </p>
                
                
                <div className="absolute bottom-0 left-0 h-1.5 w-full bg-gradient-to-r from-primary via-indigo-500 to-primary"></div>
              </div>

              <div className="group relative flex flex-col overflow-hidden rounded-2xl border border-border/40 bg-gradient-to-br from-surface/70 to-surface/50 p-10 backdrop-blur-sm transition-all duration-500 hover:scale-[1.03] hover:border-primary/60 hover:from-surface/90 hover:to-surface/70 hover:shadow-2xl hover:shadow-primary/30">
                
                <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-transparent opacity-60 transition-opacity duration-500 group-hover:opacity-100"></div>
                
                
                <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-primary/12 blur-2xl opacity-40 transition-opacity duration-500 group-hover:opacity-60"></div>
                
                
                <div className="relative mb-6 inline-flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-primary/10 shadow-lg shadow-primary/25 transition-all duration-500 group-hover:scale-110 group-hover:shadow-xl group-hover:shadow-primary/40">
                  <svg className="h-10 w-10 text-current" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-white/20 to-transparent"></div>
                  <div className="absolute -inset-1 rounded-2xl bg-primary/15 blur-md opacity-60"></div>
                </div>
                
                <h3 className="relative mb-4 text-2xl font-bold text-text">
                  Auditable Smart Contracts
                </h3>
                <p className="relative flex-1 text-base leading-relaxed text-text-muted">
                  All contract code is open-source and verifiable on-chain. Every transaction 
                  and operation is transparent and auditable.
                </p>
                
                
                <div className="absolute bottom-0 left-0 h-1.5 w-full bg-gradient-to-r from-primary via-indigo-500 to-primary"></div>
              </div>

              <div className="group relative flex flex-col overflow-hidden rounded-2xl border border-border/40 bg-gradient-to-br from-surface/70 to-surface/50 p-10 backdrop-blur-sm transition-all duration-500 hover:scale-[1.03] hover:border-secondary/60 hover:from-surface/90 hover:to-surface/70 hover:shadow-2xl hover:shadow-secondary/30">
                
                <div className="absolute inset-0 bg-gradient-to-br from-secondary/10 via-transparent to-transparent opacity-60 transition-opacity duration-500 group-hover:opacity-100"></div>
                
                
                <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-secondary/12 blur-2xl opacity-40 transition-opacity duration-500 group-hover:opacity-60"></div>
                
                
                <div className="relative mb-6 inline-flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-secondary/20 to-secondary/10 shadow-lg shadow-secondary/25 transition-all duration-500 group-hover:scale-110 group-hover:shadow-xl group-hover:shadow-secondary/40">
                  <LightningIcon className="h-10 w-10 text-current" />
                  <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-white/20 to-transparent"></div>
                  <div className="absolute -inset-1 rounded-2xl bg-secondary/15 blur-md opacity-60"></div>
                </div>
                
                <h3 className="relative mb-4 text-2xl font-bold text-text">
                  Ethereum-Compatible
                </h3>
                <p className="relative flex-1 text-base leading-relaxed text-text-muted">
                  Built on Ethereum and compatible EVM chains. Leverage the security and 
                  decentralization of the Ethereum ecosystem.
                </p>
                
                
                <div className="absolute bottom-0 left-0 h-1.5 w-full bg-gradient-to-r from-secondary via-teal-500 to-secondary"></div>
              </div>

              <div className="group relative flex flex-col overflow-hidden rounded-2xl border border-border/40 bg-gradient-to-br from-surface/70 to-surface/50 p-10 backdrop-blur-sm transition-all duration-500 hover:scale-[1.03] hover:border-secondary/60 hover:from-surface/90 hover:to-surface/70 hover:shadow-2xl hover:shadow-secondary/30">
                
                <div className="absolute inset-0 bg-gradient-to-br from-secondary/10 via-transparent to-transparent opacity-60 transition-opacity duration-500 group-hover:opacity-100"></div>
                
                
                <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-secondary/12 blur-2xl opacity-40 transition-opacity duration-500 group-hover:opacity-60"></div>
                
                
                <div className="relative mb-6 inline-flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-secondary/20 to-secondary/10 shadow-lg shadow-secondary/25 transition-all duration-500 group-hover:scale-110 group-hover:shadow-xl group-hover:shadow-secondary/40">
                  <GlobeIcon className="h-10 w-10 text-current" />
                  <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-white/20 to-transparent"></div>
                  <div className="absolute -inset-1 rounded-2xl bg-secondary/15 blur-md opacity-60"></div>
                </div>
                
                <h3 className="relative mb-4 text-2xl font-bold text-text">
                  Open Participation
                </h3>
                <p className="relative flex-1 text-base leading-relaxed text-text-muted">
                  After the auction phase, anyone can participate in the LBP and trading. 
                  No gatekeeping, no restrictions—truly decentralized access.
                </p>
                
                
                <div className="absolute bottom-0 left-0 h-1.5 w-full bg-gradient-to-r from-secondary via-teal-500 to-secondary"></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      
      <section className="relative overflow-hidden border-t border-border/30 bg-gradient-to-b from-background via-surface/10 to-background py-24 sm:py-32">
        
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(99,102,241,0.08),transparent_70%)]"></div>
          <div className="absolute left-1/4 top-1/4 h-96 w-96 rounded-full bg-primary/8 blur-3xl"></div>
          <div className="absolute right-1/4 bottom-1/4 h-96 w-96 rounded-full bg-secondary/6 blur-3xl"></div>
        </div>
        
        <div className="container relative mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-4xl text-center">
            <h2 className="mb-6 text-4xl font-bold text-text sm:text-5xl lg:text-6xl">
              Ready to Get Started?
            </h2>
            <p className="mb-12 text-lg leading-relaxed text-text-muted sm:text-xl">
              Explore active presales or create your own token launch using the STPP protocol
            </p>

            <div className="flex flex-col items-center justify-center gap-6 sm:flex-row">
              <NavLink
                to="/all"
                className="group relative inline-flex items-center gap-3 overflow-hidden rounded-xl bg-gradient-to-r from-primary via-indigo-600 to-primary bg-[length:200%_auto] px-12 py-5 text-base font-bold text-white shadow-2xl shadow-primary/40 transition-all duration-500 hover:scale-110 hover:shadow-primary/60 animate-gradientShift"
              >
                <span className="relative z-10">View All Presales</span>
                <svg className="relative z-10 h-5 w-5 transition-transform duration-300 group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
                <div className="absolute inset-0 bg-gradient-to-r from-indigo-600 via-primary to-indigo-600 opacity-0 transition-opacity duration-500 group-hover:opacity-100"></div>
              </NavLink>

              {account ? (
                <NavLink
                  to="/create"
                  className="group relative inline-flex items-center gap-3 overflow-hidden rounded-xl border-2 border-secondary/50 bg-gradient-to-br from-surface/80 to-surface/60 px-12 py-5 text-base font-bold text-text backdrop-blur-sm transition-all duration-500 hover:scale-110 hover:border-secondary hover:bg-surface/80 hover:shadow-2xl hover:shadow-secondary/30"
                >
                  <span className="relative z-10">Create Presale</span>
                  <svg className="relative z-10 h-5 w-5 transition-transform duration-300 group-hover:rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                  </svg>
                  <div className="absolute inset-0 bg-gradient-to-br from-secondary/10 via-transparent to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100"></div>
                </NavLink>
              ) : (
                <div className="rounded-xl border-2 border-secondary/50 bg-gradient-to-br from-surface/80 to-surface/60 px-12 py-5 backdrop-blur-sm transition-all duration-500 hover:scale-110 hover:border-secondary hover:bg-surface/80 hover:shadow-2xl hover:shadow-secondary/30">
                  <ConnectButton showBalance={false} chainStatus="icon" />
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Home;
