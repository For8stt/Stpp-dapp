import React from "react";

const Section = ({ title, description, children }) => (
  <div className="relative mb-6 overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-[#334155] to-[#1e293b] p-6 shadow-lg transition-all duration-300 hover:border-[rgba(255,255,255,0.25)] hover:shadow-xl">
    <div className="mb-6">
      <p className="mb-2 text-xl font-bold text-text">{title}</p>
      {description && <p className="max-w-[600px] text-sm leading-relaxed text-text-muted">{description}</p>}
    </div>
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">{children}</div>
  </div>
);

const Input = ({ label, name, value, onChange, type = "text", placeholder, helper }) => (
  <label className="flex flex-col gap-2">
    <span className="mb-1 text-sm font-semibold text-text">{label}</span>
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

const TextArea = ({ label, name, value, onChange, placeholder, helper }) => (
  <label className="col-span-full flex flex-col gap-2">
    <span className="mb-1 text-sm font-semibold text-text">{label}</span>
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

const CreatePresaleForm = ({ values, onChange, onSubmit, submitting, disabled }) => (
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
      />
      <Input
        label="Treasury Address"
        name="treasury"
        value={values.treasury}
        onChange={onChange}
        placeholder="0x..."
      />
      <Input
        label="Tokens for Sale"
        name="tokensForSale"
        value={values.tokensForSale}
        onChange={onChange}
        placeholder="1_000_000"
        helper="Human-readable amount; will be converted to 18 decimals."
      />
      <Input
        label="Bonus Reserve"
        name="bonusReserve"
        value={values.bonusReserve}
        onChange={onChange}
        placeholder="50_000"
      />
      <Input
        label="Per Address Cap"
        name="perAddressCap"
        value={values.perAddressCap}
        onChange={onChange}
        placeholder="10_000"
      />
      <Input
        label="Soft Cap"
        name="softCap"
        value={values.softCap}
        onChange={onChange}
        placeholder="500_000"
      />
    </Section>

    <Section title="Auction schedule" description="Key timing parameters for the Dutch auction.">
      <Input
        label="Auction start"
        name="startTime"
        type="datetime-local"
        value={values.startTime}
        onChange={onChange}
      />
      <Input
        label="Commit duration (seconds)"
        name="commitDuration"
        value={values.commitDuration}
        onChange={onChange}
        placeholder="3600"
      />
      <Input
        label="Reveal duration (seconds)"
        name="revealDuration"
        value={values.revealDuration}
        onChange={onChange}
        placeholder="3600"
      />
      <Input
        label="Demand check delay (seconds after start)"
        name="demandCheckDelay"
        value={values.demandCheckDelay}
        onChange={onChange}
        placeholder="600"
      />
      <Input
        label="Early bonus window (seconds)"
        name="earlyBonusWindow"
        value={values.earlyBonusWindow}
        onChange={onChange}
        placeholder="600"
      />
      <Input
        label="Early bonus percentage (BPS)"
        name="earlyBonusPct"
        value={values.earlyBonusPct}
        onChange={onChange}
        placeholder="500"
      />
      <Input
        label="Non-reveal penalty (BPS)"
        name="nonRevealPenaltyBps"
        value={values.nonRevealPenaltyBps}
        onChange={onChange}
        placeholder="0"
      />
      <Input
        label="LBP stable share (BPS)"
        name="lbpStableShareBps"
        value={values.lbpStableShareBps}
        onChange={onChange}
        placeholder="4000"
      />
      <Input
        label="Threshold low"
        name="thresholdLow"
        value={values.thresholdLow}
        onChange={onChange}
        placeholder="100"
        helper="ETH threshold for low demand; if deposits are below this at demand check time, the auction can be accelerated."
      />
      <Input
        label="Max decay multiplier"
        name="maxDecayMultiplier"
        value={values.maxDecayMultiplier}
        onChange={onChange}
        placeholder="1"
      />
      <Input
        label="Minimum commit duration"
        name="minCommitDuration"
        value={values.minCommitDuration}
        onChange={onChange}
        placeholder="900"
      />
      <Input
        label="Merkle root (optional)"
        name="merkleRoot"
        value={values.merkleRoot}
        onChange={onChange}
        placeholder="0x0000..."
      />
      <Input
        label="Vesting start"
        name="vestingStart"
        type="datetime-local"
        value={values.vestingStart}
        onChange={onChange}
      />
      <Input
        label="Vesting duration (seconds)"
        name="vestingDuration"
        value={values.vestingDuration}
        onChange={onChange}
        placeholder="10800"
      />
      <TextArea
        label="Price ticks (comma separated, ETH units)"
        name="priceTicks"
        value={values.priceTicks}
        onChange={onChange}
        placeholder="1,0.9,0.8,0.7"
        helper="Highest price first. Each value converted to wei."
      />
    </Section>

    <Section title="LBP configuration" description="Defines timing and pool weights for the liquidity bootstrap pool.">
      <Input
        label="LBP start"
        name="lbpStart"
        type="datetime-local"
        value={values.lbpStart}
        onChange={onChange}
      />
      <Input
        label="LBP end"
        name="lbpEnd"
        type="datetime-local"
        value={values.lbpEnd}
        onChange={onChange}
      />
      <Input
        label="Pool start weight %"
        name="poolStartWeightToken"
        value={values.poolStartWeightToken}
        onChange={onChange}
        placeholder="80"
      />
      <Input
        label="Pool end weight %"
        name="poolEndWeightToken"
        value={values.poolEndWeightToken}
        onChange={onChange}
        placeholder="20"
      />
      <Input
        label="Pool swap fee"
        name="poolSwapFee"
        value={values.poolSwapFee}
        onChange={onChange}
        placeholder="0.003"
        helper="Denominated in ETH (e.g. 0.003 = 0.3%)"
      />
      <Input
        label="Vesting cliff duration (seconds)"
        name="vestingCliffDuration"
        value={values.vestingCliffDuration}
        onChange={onChange}
        placeholder="0"
      />
      <Input
        label="Vesting final duration (seconds)"
        name="vestingFinalDuration"
        value={values.vestingFinalDuration}
        onChange={onChange}
        placeholder="2592000"
      />
      <Input
        label="Vesting cliff percent (BPS)"
        name="vestingCliffPercentBP"
        value={values.vestingCliffPercentBP}
        onChange={onChange}
        placeholder="0"
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
