import React from "react";
import styles from "./css/CreatePresaleForm.module.css";

const Section = ({ title, description, children }) => (
  <div className="section-card">
    <div className="section-header">
      <p className="section-title">{title}</p>
      {description && <p className="section-description">{description}</p>}
    </div>
    <div className="section-content">{children}</div>
  </div>
);

const Input = ({ label, name, value, onChange, type = "text", placeholder, helper }) => (
  <label className="input-wrapper">
    <span className="input-label">{label}</span>
    {helper && <span className="input-helper">{helper}</span>}
    <input
      type={type}
      name={name}
      value={value}
      onChange={(event) => onChange(name, event.target.value)}
      placeholder={placeholder}
      className="input-field"
    />
  </label>
);

const TextArea = ({ label, name, value, onChange, placeholder, helper }) => (
  <label className="textarea-wrapper">
    <span className="input-label">{label}</span>
    {helper && <span className="input-helper">{helper}</span>}
    <textarea
      name={name}
      value={value}
      onChange={(event) => onChange(name, event.target.value)}
      placeholder={placeholder}
      className="textarea-field"
    />
  </label>
);

const CreatePresaleForm = ({ values, onChange, onSubmit, submitting }) => (
  <form
    onSubmit={(event) => {
      event.preventDefault();
      onSubmit();
    }}
    className={styles.form}
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
        placeholder="1800"
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
        placeholder="0"
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
        placeholder="2592000"
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

    <div className={styles.submitCard}>
      <p className={styles.submitText}>All values are validated before sending the transaction. Gas estimation may take a few seconds.</p>
      <button
        type="submit"
        disabled={submitting}
        className={styles.submitButton}
      >
        {submitting ? "Creating..." : "Create Presale"}
      </button>
    </div>
  </form>
);

export default CreatePresaleForm;
