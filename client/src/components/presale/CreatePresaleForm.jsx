import React, { useState, useMemo } from "react";

const Section = ({ title, description, children }) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  
  return (
    <div className="group relative mb-10 overflow-hidden rounded-2xl border-2 border-primary/50 bg-gradient-to-br from-surface via-surface to-surface p-8 backdrop-blur-sm shadow-2xl shadow-primary/20 transition-all duration-500 hover:border-primary/80 hover:shadow-[0_0_40px_rgba(99,102,241,0.3)] sm:p-10">
      
      <div className="absolute inset-0 bg-gradient-to-br from-primary/15 via-transparent to-secondary/12 opacity-70 transition-opacity duration-500 group-hover:opacity-100"></div>
      
      
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary via-indigo-500 to-secondary opacity-60 transition-opacity duration-500 group-hover:opacity-100"></div>
      
      
      <div className="absolute top-0 left-0 h-16 w-16 border-t-2 border-l-2 border-primary/60 rounded-tl-2xl"></div>
      <div className="absolute top-0 right-0 h-16 w-16 border-t-2 border-r-2 border-secondary/60 rounded-tr-2xl"></div>
      <div className="absolute bottom-0 left-0 h-16 w-16 border-b-2 border-l-2 border-primary/60 rounded-bl-2xl"></div>
      <div className="absolute bottom-0 right-0 h-16 w-16 border-b-2 border-r-2 border-secondary/60 rounded-br-2xl"></div>
      
      
      <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-primary/20 blur-3xl opacity-60 transition-opacity duration-500 group-hover:opacity-80"></div>
      <div className="absolute -bottom-8 -left-8 h-32 w-32 rounded-full bg-secondary/15 blur-3xl opacity-50 transition-opacity duration-500 group-hover:opacity-70"></div>
      
      <div className="relative z-10">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 flex-1">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary/30 to-primary/15 text-primary shadow-lg">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <p className="bg-gradient-to-r from-text via-primary to-text bg-clip-text text-2xl font-bold text-transparent">{title}</p>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsCollapsed(!isCollapsed);
            }}
            className="flex h-10 w-10 items-center justify-center rounded-xl border-2 border-primary/50 bg-gradient-to-br from-primary/20 to-primary/10 text-primary shadow-md transition-all duration-300 hover:border-primary/70 hover:bg-gradient-to-br hover:from-primary/30 hover:to-primary/20 hover:scale-105 hover:shadow-lg"
            aria-label={isCollapsed ? "Expand section" : "Collapse section"}
          >
            <svg 
              className={`h-5 w-5 transition-transform duration-300 ${isCollapsed ? 'rotate-180' : ''}`}
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
        {description && !isCollapsed && (
          <p className="ml-13 mb-8 max-w-[600px] text-base leading-relaxed text-text-muted transition-opacity duration-300">{description}</p>
        )}
        <div className={`relative z-10 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 transition-all duration-500 ease-in-out ${
          isCollapsed ? 'max-h-0 opacity-0 overflow-hidden' : 'max-h-[10000px] opacity-100'
        }`}>
          {children}
        </div>
      </div>
    </div>
  );
};

const Tooltip = ({ children, text }) => {
  const [show, setShow] = useState(false);
  
  if (!text) return children;
  
  return (
    <div className="relative inline-block">
      <div
        className="inline-flex items-center gap-1.5 cursor-help"
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
      >
        {children}
        <svg
          className="w-4 h-4 text-text-muted hover:text-text transition-colors"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      </div>
      {show && (
        <div className="absolute z-50 w-72 rounded-xl border-2 border-primary/60 bg-gradient-to-br from-surface via-surface to-surface p-4 text-sm leading-relaxed text-text shadow-2xl shadow-primary/30 backdrop-blur-xl mt-2 left-0 top-full pointer-events-none">
          <div className="absolute -top-1 left-4 h-2 w-2 rotate-45 border-l-2 border-t-2 border-primary/60 bg-surface"></div>
          <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-primary/10 via-transparent to-transparent"></div>
          <div className="relative z-10">{text}</div>
        </div>
      )}
    </div>
  );
};

const Input = ({ label, name, value, onChange, type = "text", placeholder, helper, tooltip, showOwnershipIndicator, userAccount, disabled = false }) => {
  const isOwned = useMemo(() => {
    if (!showOwnershipIndicator || !userAccount || !value) return false;
    try {
      return value.toLowerCase() === userAccount.toLowerCase();
    } catch {
      return false;
    }
  }, [showOwnershipIndicator, userAccount, value]);

  return (
  <label className="group/input relative flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Tooltip text={tooltip}>
          <span className="text-sm font-bold text-text">{label}</span>
        </Tooltip>
        {showOwnershipIndicator && userAccount && value && (
          <span
            className={`inline-flex items-center gap-1 rounded-full border-2 px-2.5 py-1 text-xs font-bold ${
              isOwned
                ? "border-secondary/60 bg-secondary/20 text-secondary shadow-md shadow-secondary/20"
                : "border-orange-500/60 bg-orange-500/20 text-orange-400 shadow-md shadow-orange-500/20"
            }`}
            title={isOwned ? "This is your address" : "This is an external address"}
          >
            {isOwned ? (
              <>
                <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Your Address
              </>
            ) : (
              "External"
            )}
          </span>
        )}
      </div>
      {helper && <span className="text-xs font-medium text-text-muted">{helper}</span>}
      <div className="relative">
        <input
          type={type}
          name={name}
          value={value}
          onChange={(event) => onChange(name, event.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className={`w-full rounded-xl border-2 border-border/50 bg-gradient-to-br from-surface/90 to-surface/80 px-5 py-4 text-base font-semibold text-text shadow-lg outline-none transition-all duration-300 focus:border-primary/80 focus:ring-2 focus:ring-primary/40 focus:ring-offset-0 focus:from-surface focus:to-surface ${
            disabled ? "opacity-50 cursor-not-allowed" : "hover:border-primary/60 hover:shadow-xl"
          }`}
        />
        <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover/input:opacity-100 pointer-events-none"></div>
      </div>
  </label>
);
};

const TextArea = ({ label, name, value, onChange, placeholder, helper, tooltip }) => (
  <label className="group/textarea col-span-full relative flex flex-col gap-3">
    <Tooltip text={tooltip}>
      <span className="text-sm font-bold text-text">{label}</span>
    </Tooltip>
    {helper && <span className="text-xs font-medium text-text-muted">{helper}</span>}
    <div className="relative">
      <textarea
        name={name}
        value={value}
        onChange={(event) => onChange(name, event.target.value)}
        placeholder={placeholder}
        className="min-h-[120px] w-full resize-y rounded-xl border-2 border-border/50 bg-gradient-to-br from-surface/90 to-surface/80 px-5 py-4 text-base font-semibold text-text shadow-lg outline-none transition-all duration-300 focus:border-primary/80 focus:ring-2 focus:ring-primary/40 focus:ring-offset-0 hover:border-primary/60 hover:shadow-xl focus:from-surface focus:to-surface"
      />
      <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover/textarea:opacity-100 pointer-events-none"></div>
    </div>
  </label>
);

const Select = ({ label, name, value, onChange, options, helper, tooltip }) => (
  <label className="group/select relative flex flex-col gap-3">
    <Tooltip text={tooltip}>
      <span className="text-sm font-bold text-text">{label}</span>
    </Tooltip>
    {helper && <span className="text-xs font-medium text-text-muted">{helper}</span>}
    <div className="relative">
      <select
        name={name}
        value={value || ""}
        onChange={(event) => onChange(name, event.target.value)}
        className="w-full appearance-none rounded-xl border-2 border-border/50 bg-gradient-to-br from-surface/90 to-surface/80 px-5 py-4 text-base font-semibold text-text shadow-lg outline-none transition-all duration-300 focus:border-primary/80 focus:ring-2 focus:ring-primary/40 focus:ring-offset-0 hover:border-primary/60 hover:shadow-xl focus:from-surface focus:to-surface cursor-pointer"
      >
        <option value="">Select {label.toLowerCase()}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover/select:opacity-100 pointer-events-none"></div>
    </div>
  </label>
);

const CreatePresaleForm = ({ values, onChange, onSubmit, submitting, disabled, userAccount }) => (
  <form
    onSubmit={(event) => {
      event.preventDefault();
      onSubmit();
    }}
    className="flex flex-col gap-6"
  >
    <Section title="Token & Treasury" description="Addresses controlling token supply and treasury withdrawals.">
      <Input
        label="Sale Token Address"
        name="saleToken"
        value={values.saleToken}
        onChange={onChange}
        placeholder="0x..."
        tooltip="Address of the ERC20 token being sold in the auction. This is the token you want to sell to participants."
      />
      <Input
        label="Treasury Address"
        name="treasury"
        value={values.treasury}
        onChange={onChange}
        placeholder="0x..."
        tooltip="Wallet address that will receive the proceeds (ETH) after the auction ends. Usually this is the project or team address."
        showOwnershipIndicator={true}
        userAccount={userAccount}
      />
      <Input
        label="Tokens for Sale"
        name="tokensForSale"
        value={values.tokensForSale}
        onChange={onChange}
        placeholder="1_000_000"
        tooltip="Total number of tokens to be sold in the auction. Specified in regular units (will be converted to 18 decimals)."
      />
      <Input
        label="Bonus Reserve"
        name="bonusReserve"
        value={values.bonusReserve}
        onChange={onChange}
        placeholder="50_000"
        tooltip="Reserve of tokens for early participant bonuses. These tokens are used to award additional tokens to those who placed bids during the early bonus period."
      />
      <Input
        label="Per Address Cap"
        name="perAddressCap"
        value={values.perAddressCap}
        onChange={onChange}
        placeholder="10_000"
        tooltip="Maximum number of tokens that a single address (wallet) can purchase. This limit helps prevent token concentration in few hands."
      />
      <Input
        label="Soft Cap"
        name="softCap"
        value={values.softCap}
        onChange={onChange}
        placeholder="500_000"
        tooltip="Minimum fundraising amount in ETH that must be reached for successful auction completion. If the amount doesn't reach this threshold, the auction may be cancelled."
      />
    </Section>

    <Section title="Auction schedule" description="Key timing parameters for the Dutch auction.">
      <Input
        label="Auction start"
        name="startTime"
        type="datetime-local"
        value={values.startTime}
        onChange={onChange}
        tooltip="Date and time when the auction starts. From this moment, participants can begin placing bids (commit phase)."
      />
      <Input
        label="Commit duration (seconds)"
        name="commitDuration"
        value={values.commitDuration}
        onChange={onChange}
        placeholder="3600"
        tooltip="Duration of the commit phase (in seconds). During this phase, participants make encrypted bids with ETH deposits. For example, 3600 = 1 hour."
      />
      <Input
        label="Reveal duration (seconds)"
        name="revealDuration"
        value={values.revealDuration}
        onChange={onChange}
        placeholder="3600"
        tooltip="Duration of the reveal phase (in seconds). After the commit phase ends, participants must reveal their bids by showing the price and token quantity. For example, 3600 = 1 hour."
      />
      <Input
        label="Demand check delay (seconds after start)"
        name="demandCheckDelay"
        value={values.demandCheckDelay}
        onChange={onChange}
        placeholder="600"
        tooltip="Time after auction start (in seconds) when demand is checked. If collected deposits are below the threshold (Threshold low), the auction can be accelerated. For example, 600 = 10 minutes."
      />
      <Input
        label="Early bonus window (seconds)"
        name="earlyBonusWindow"
        value={values.earlyBonusWindow}
        onChange={onChange}
        placeholder="600"
        tooltip="Time window from auction start (in seconds) during which participants receive a bonus for early participation. Bids placed during this period receive additional tokens from the Bonus Reserve."
      />
      <Input
        label="Early bonus percentage (BPS)"
        name="earlyBonusPct"
        value={values.earlyBonusPct}
        onChange={onChange}
        placeholder="500"
        tooltip="Bonus percentage for early participants in basis points (BPS). 1 BPS = 0.01%. For example, 500 BPS = 5% additional tokens for those who bid during the Early bonus window."
      />
      <Input
        label="Non-reveal penalty (BPS)"
        name="nonRevealPenaltyBps"
        value={values.nonRevealPenaltyBps}
        onChange={onChange}
        placeholder="0"
        tooltip="Penalty in basis points (BPS) for participants who committed but did not reveal their bid in the reveal phase. If 0, there is no penalty. For example, 100 BPS = 1% penalty from the deposit."
      />
      <Input
        label="LBP stable share (BPS)"
        name="lbpStableShareBps"
        value={values.lbpStableShareBps}
        onChange={onChange}
        placeholder="4000"
        tooltip="Share of stablecoins (e.g., USDC) in the LBP pool after auction completion, expressed in basis points. 4000 BPS = 40% stablecoins, 60% project tokens."
      />
      <Input
        label="Threshold low"
        name="thresholdLow"
        value={values.thresholdLow}
        onChange={onChange}
        placeholder="100"
        tooltip="Low demand threshold in ETH. If collected deposits are below this value at the demand check time (Demand check delay), the auction can be accelerated (commit phase may be shortened)."
      />
      <Input
        label="Max decay multiplier"
        name="maxDecayMultiplier"
        value={values.maxDecayMultiplier}
        onChange={onChange}
        placeholder="1"
        tooltip="Maximum decay multiplier for auction acceleration. Used in dynamic adjustment when demand is low. A value of 1 means no acceleration."
      />
      <Input
        label="Minimum commit duration"
        name="minCommitDuration"
        value={values.minCommitDuration}
        onChange={onChange}
        placeholder="900"
        tooltip="Minimum duration of the commit phase in seconds, even if the auction is accelerated due to low demand. This ensures participants have a minimum time to participate. For example, 900 = 15 minutes."
      />
      <Input
        label="Merkle root (optional)"
        name="merkleRoot"
        value={values.merkleRoot}
        onChange={onChange}
        placeholder="0x0000..."
        tooltip="Merkle tree root for whitelist. If specified, only addresses from the whitelist can participate in the auction. If left empty (0x0000...), the auction will be public."
      />
      <Input
        label="Whitelist IPFS CID (optional)"
        name="whitelistCID"
        value={values.whitelistCID}
        onChange={onChange}
        placeholder="QmaLHnZdsTc1xumK67MTH5Jj6S5yVtytixA6S26ukBRT2R"
        disabled={!values.merkleRoot || values.merkleRoot.trim() === "" || values.merkleRoot.trim() === "0x0000000000000000000000000000000000000000000000000000000000000000"}
        tooltip={!values.merkleRoot || values.merkleRoot.trim() === "" || values.merkleRoot.trim() === "0x0000000000000000000000000000000000000000000000000000000000000000"
          ? "IPFS CID requires Merkle root. Please provide Merkle root first."
          : "IPFS CID of the whitelist JSON file. This allows users to automatically load their Merkle proof. Leave empty if you don't have the CID yet - you can set it later via setWhitelistCID()."}
      />
      <Input
        label="Vesting start"
        name="vestingStart"
        type="datetime-local"
        value={values.vestingStart}
        onChange={onChange}
        tooltip="Date and time when vesting (gradual token unlock) begins. From this moment, participants start receiving their tokens gradually over the Vesting duration period."
      />
      <Input
        label="Vesting duration (seconds)"
        name="vestingDuration"
        value={values.vestingDuration}
        onChange={onChange}
        placeholder="10800"
        tooltip="Vesting duration in seconds - the time period during which tokens will be gradually unlocked for participants. For example, 10800 = 3 hours, 2592000 = 30 days."
      />
      <TextArea
        label="Price ticks (comma separated, ETH units)"
        name="priceTicks"
        value={values.priceTicks}
        onChange={onChange}
        placeholder="1,0.9,0.8,0.7"
        tooltip="Price levels for the Dutch auction, separated by commas. Specify from highest to lowest price. Each value is the price in ETH per token. For example, '1,0.9,0.8' means: start at 1 ETH/token, then 0.9 ETH/token, then 0.8 ETH/token."
      />
    </Section>

    <Section title="LBP configuration" description="Defines timing and pool weights for the liquidity bootstrap pool.">
      <Input
        label="LBP start"
        name="lbpStart"
        type="datetime-local"
        value={values.lbpStart}
        onChange={onChange}
        tooltip="Date and time when the LBP (Liquidity Bootstrap Pool) starts. LBP is a liquidity pool where remaining tokens after the auction will be sold through an automated market maker with dynamic pricing."
      />
      <Input
        label="LBP end"
        name="lbpEnd"
        type="datetime-local"
        value={values.lbpEnd}
        onChange={onChange}
        tooltip="Date and time when the LBP ends. After this moment, the pool stops changing weights and the price stabilizes."
      />
      <Input
        label="Pool start weight %"
        name="poolStartWeightToken"
        value={values.poolStartWeightToken}
        onChange={onChange}
        placeholder="80"
        tooltip="Initial weight of project tokens in the LBP pool as a percentage. For example, 80% means that at the start, 80% of the pool value consists of project tokens, and 20% are stablecoins. Over time, the weight decreases to Pool end weight %."
      />
      <Input
        label="Pool end weight %"
        name="poolEndWeightToken"
        value={values.poolEndWeightToken}
        onChange={onChange}
        placeholder="20"
        tooltip="Final weight of project tokens in the LBP pool as a percentage. By the end of the LBP, the token weight will decrease from Pool start weight % to this value. For example, 20% means that at the end, 20% of the pool value is project tokens, 80% are stablecoins."
      />
      <Input
        label="Pool swap fee"
        name="poolSwapFee"
        value={values.poolSwapFee}
        onChange={onChange}
        placeholder="0.003"
        tooltip="Swap fee in the LBP pool, expressed in ETH. For example, 0.003 = 0.3% fee per transaction. This fee goes to the liquidity pool."
      />

          <Select
            label="Initial fee"
            name="initialFeePreset"
            value={values.initialFeePreset || ""}
            onChange={onChange}
            tooltip="Initial fee percentage for LBP transactions. High initial fee protects the launch from bots and arbitrage. The fee will linearly decay to the final fee over the Fee decay duration period."
            options={[
              { value: "0", label: "5%" },
              { value: "1", label: "10%" },
              { value: "2", label: "15%" },
            ]}
          />
          <Select
            label="Fee decay duration"
            name="feeDecayDurationPreset"
            value={values.feeDecayDurationPreset || ""}
            onChange={onChange}
            tooltip="Duration during which the fee linearly decays from the initial fee to the final fee (1%). After this period, the fee stays at the final rate. Options: 10, 15, or 30 minutes."
            options={[
              { value: "0", label: "10 minutes" },
              { value: "1", label: "15 minutes" },
              { value: "2", label: "30 minutes" },
            ]}
          />
      <Input
        label="Vesting cliff duration (seconds)"
        name="vestingCliffDuration"
        value={values.vestingCliffDuration}
        onChange={onChange}
        placeholder="0"
        tooltip="Duration of the vesting cliff period in seconds. Cliff is a period during which tokens are not unlocked at all. After the cliff ends, linear unlocking begins. If 0, there is no cliff."
      />
      <Input
        label="Vesting final duration (seconds)"
        name="vestingFinalDuration"
        value={values.vestingFinalDuration}
        onChange={onChange}
        placeholder="2592000"
        tooltip="Total vesting duration for LBP in seconds. This is the time from vesting start to full unlock of all tokens. For example, 2592000 = 30 days. Tokens unlock linearly during this period after the cliff."
      />
      <Input
        label="Vesting cliff percent (BPS)"
        name="vestingCliffPercentBP"
        value={values.vestingCliffPercentBP}
        onChange={onChange}
        placeholder="0"
        tooltip="Percentage of tokens that remain locked during the cliff period, expressed in basis points (BPS). 1 BPS = 0.01%. For example, 1500 BPS = 15% of tokens stay locked during the cliff."
      />
      <Input
        label="Max contribution per address (ETH)"
        name="maxContributionPerAddress"
        value={values.maxContributionPerAddress || ""}
        onChange={onChange}
        placeholder="5"
        type="number"
        tooltip="Maximum amount of ETH that a single address (wallet) can contribute during the LBP. This limit helps prevent token concentration and ensures fair distribution. For example, 5 ETH means no single address can contribute more than 5 ETH."
      />
    </Section>

    <div className="group/action relative flex flex-col items-center justify-between gap-6 overflow-hidden rounded-2xl border-2 border-secondary/60 bg-gradient-to-br from-secondary/25 via-secondary/20 to-secondary/15 p-8 shadow-xl backdrop-blur-sm transition-all duration-500 hover:border-secondary/80 hover:from-secondary/30 hover:via-secondary/25 hover:to-secondary/20 hover:shadow-2xl hover:shadow-secondary/30 md:flex-row md:text-left">
      
      <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-secondary via-teal-500 to-secondary opacity-80 transition-opacity duration-500 group-hover/action:opacity-100"></div>
      
      
      <div className="absolute top-0 left-0 h-8 w-8 border-t-2 border-l-2 border-secondary/60 rounded-tl-2xl"></div>
      <div className="absolute top-0 right-0 h-8 w-8 border-t-2 border-r-2 border-secondary/60 rounded-tr-2xl"></div>
      
      
      <div className="absolute -right-6 -top-6 h-20 w-20 rounded-full bg-secondary/15 blur-2xl opacity-50 transition-opacity duration-500 group-hover/action:opacity-70"></div>
      <div className="absolute -bottom-6 -left-6 h-20 w-20 rounded-full bg-secondary/12 blur-2xl opacity-40 transition-opacity duration-500 group-hover/action:opacity-60"></div>
      
      <p className="relative z-10 m-0 text-center text-base leading-relaxed text-text md:text-left">All values are validated before sending the transaction. Gas estimation may take a few seconds.</p>
      <button
        type="submit"
        disabled={submitting || disabled}
        className="group/btn relative z-10 min-w-[180px] overflow-hidden rounded-xl bg-gradient-to-r from-secondary via-teal-500 to-secondary px-8 py-4 text-base font-bold text-white shadow-2xl shadow-secondary/40 transition-all duration-300 disabled:cursor-not-allowed disabled:opacity-60 hover:scale-105 hover:shadow-[0_0_40px_rgba(20,184,166,0.6)] disabled:hover:scale-100 disabled:hover:shadow-2xl md:w-auto"
        title={disabled ? "Insufficient token balance. Please ensure you have enough tokens before creating the auction." : ""}
      >
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent opacity-0 transition-opacity duration-500 group-hover/btn:opacity-100"></div>
        <span className="relative z-10 flex items-center gap-2">
          {submitting ? (
            <>
              <svg className="h-5 w-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Creating...
            </>
          ) : disabled ? (
            <>
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              Insufficient Balance
            </>
          ) : (
            <>
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              Create Presale
            </>
          )}
        </span>
      </button>
    </div>
  </form>
);

export default CreatePresaleForm;
