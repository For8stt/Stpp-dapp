import React, { useState, useMemo } from "react";

const Section = ({ title, description, children }) => (
  <div className="relative mb-6 overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-[#334155] to-[#1e293b] p-6 shadow-lg transition-all duration-300 hover:border-[rgba(255,255,255,0.25)] hover:shadow-xl">
    <div className="mb-6">
      <p className="mb-2 text-xl font-bold text-text">{title}</p>
      {description && <p className="max-w-[600px] text-sm leading-relaxed text-text-muted">{description}</p>}
    </div>
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">{children}</div>
  </div>
);

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
        <div className="absolute z-50 w-64 p-3 text-xs leading-relaxed text-text bg-gradient-to-br from-[#1e293b] to-[#334155] border border-border rounded-lg shadow-xl mt-2 left-0 top-full pointer-events-none">
          {text}
        </div>
      )}
    </div>
  );
};

const Input = ({ label, name, value, onChange, type = "text", placeholder, helper, tooltip, showOwnershipIndicator, userAccount }) => {
  const isOwned = useMemo(() => {
    if (!showOwnershipIndicator || !userAccount || !value) return false;
    try {
      return value.toLowerCase() === userAccount.toLowerCase();
    } catch {
      return false;
    }
  }, [showOwnershipIndicator, userAccount, value]);

  return (
    <label className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Tooltip text={tooltip}>
          <span className="mb-1 text-sm font-semibold text-text">{label}</span>
        </Tooltip>
        {showOwnershipIndicator && userAccount && value && (
          <span
            className={`px-2 py-0.5 rounded text-xs font-semibold ${
              isOwned
                ? "bg-green-500/20 text-green-400 border border-green-500/50"
                : "bg-orange-500/20 text-orange-400 border border-orange-500/50"
            }`}
            title={isOwned ? "This is your address" : "This is an external address"}
          >
            {isOwned ? "Your Address" : "External"}
          </span>
        )}
      </div>
      {helper && <span className="text-xs italic text-text-muted">{helper}</span>}
      <input
        type={type}
        name={name}
        value={value}
        onChange={(event) => onChange(name, event.target.value)}
        placeholder={placeholder}
        className="rounded-xl border border-border bg-gradient-to-br from-[#1e293b] to-[#334155] px-4 py-3.5 text-sm text-text shadow-sm outline-none transition-all duration-300 focus:border-primary focus:ring-2 focus:ring-primary/20 focus:ring-offset-0"
      />
    </label>
  );
};

const TextArea = ({ label, name, value, onChange, placeholder, helper, tooltip }) => (
  <label className="col-span-full flex flex-col gap-2">
    <Tooltip text={tooltip}>
      <span className="mb-1 text-sm font-semibold text-text">{label}</span>
    </Tooltip>
    {helper && <span className="text-xs italic text-text-muted">{helper}</span>}
    <textarea
      name={name}
      value={value}
      onChange={(event) => onChange(name, event.target.value)}
      placeholder={placeholder}
      className="min-h-[120px] resize-y rounded-xl border border-border bg-gradient-to-br from-[#1e293b] to-[#334155] px-4 py-3.5 text-sm text-text shadow-sm outline-none transition-all duration-300 focus:border-primary focus:ring-2 focus:ring-primary/20 focus:ring-offset-0"
    />
  </label>
);

const Select = ({ label, name, value, onChange, options, helper, tooltip }) => (
  <label className="flex flex-col gap-2">
    <Tooltip text={tooltip}>
      <span className="mb-1 text-sm font-semibold text-text">{label}</span>
    </Tooltip>
    {helper && <span className="text-xs italic text-text-muted">{helper}</span>}
    <select
      name={name}
      value={value || ""}
      onChange={(event) => onChange(name, event.target.value)}
      className="rounded-xl border border-border bg-gradient-to-br from-[#1e293b] to-[#334155] px-4 py-3.5 text-sm text-text shadow-sm outline-none transition-all duration-300 focus:border-primary focus:ring-2 focus:ring-primary/20 focus:ring-offset-0 cursor-pointer"
    >
      <option value="">Select {label.toLowerCase()}</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
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

    <div className="relative flex flex-col items-center justify-between gap-6 overflow-hidden rounded-2xl border border-[rgba(34,197,94,0.2)] bg-gradient-to-br from-[rgba(34,197,94,0.05)] to-[rgba(22,163,74,0.03)] p-6 shadow-lg backdrop-blur-sm before:absolute before:left-0 before:right-0 before:top-0 before:h-0.5 before:rounded-t-2xl before:bg-gradient-to-r before:from-[#22c55e] before:to-[rgba(34,197,94,0.6)] md:flex-row md:text-left">
      <p className="m-0 text-center text-sm leading-relaxed text-text-muted md:text-left">All values are validated before sending the transaction. Gas estimation may take a few seconds.</p>
      <button
        type="submit"
        disabled={submitting || disabled}
        className="min-w-[160px] rounded-xl border border-[rgba(255,255,255,0.1)] bg-gradient-to-r from-[#22c55e] via-[#16a34a] to-[#15803d] px-8 py-3.5 text-base font-semibold text-white shadow-lg transition-all duration-300 disabled:cursor-not-allowed disabled:opacity-60 hover:-translate-y-0.5 hover:shadow-xl active:translate-y-0 active:shadow-lg disabled:hover:translate-y-0 disabled:hover:shadow-lg md:w-auto"
        title={disabled ? "Insufficient token balance. Please ensure you have enough tokens before creating the auction." : ""}
      >
        {submitting ? "Creating..." : disabled ? "Insufficient Balance" : "Create Presale"}
      </button>
    </div>
  </form>
);

export default CreatePresaleForm;
