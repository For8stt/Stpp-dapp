import React from "react";

const ControlButton = ({ label, onClick, disabled }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className="rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/20 disabled:opacity-50"
  >
    {label}
  </button>
);

const Input = ({ label, name, value, onChange, type = "text", placeholder }) => (
  <label className="flex flex-col gap-1 text-xs text-white/70">
    <span>{label}</span>
    <input
      type={type}
      name={name}
      value={value}
      placeholder={placeholder}
      onChange={(event) => onChange(name, event.target.value)}
      className="rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-white outline-none transition focus:border-white/40"
    />
  </label>
);

const AuctionControls = ({
  isOwner,
  auctionAddress,
  onFinalizeAuction,
  onLaunchLbp,
  onFinalizeLbp,
  onUnwind,
  lbpConfig,
  onLbpConfigChange,
  disabled,
}) => {
  if (!isOwner) {
    return (
      <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-5 text-sm text-white/80">
        Only the owner of this presale manager can run administrative actions. Connect the wallet used to deploy the
        presale to unlock controls.
      </div>
    );
  }

  return (
    <div className="space-y-5 rounded-2xl border border-white/10 bg-slate-900/80 p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-lg font-semibold text-white">Auction controls</p>
          <p className="text-sm text-white/60">Manage the Dutch auction and downstream LBP deployment.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ControlButton label="Finalize auction" onClick={onFinalizeAuction} disabled={disabled || !auctionAddress} />
          <ControlButton label="Launch LBP" onClick={onLaunchLbp} disabled={disabled || !auctionAddress} />
          <ControlButton label="Finalize LBP" onClick={onFinalizeLbp} disabled={disabled} />
          <ControlButton label="Unwind LBP" onClick={onUnwind} disabled={disabled} />
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-slate-950/50 p-4">
        <p className="mb-3 text-sm font-semibold text-white">LBP config override</p>
        <div className="grid gap-3 md:grid-cols-2">
          <Input
            label="Start time"
            type="datetime-local"
            name="startTime"
            value={lbpConfig.startTime}
            onChange={onLbpConfigChange}
          />
          <Input
            label="End time"
            type="datetime-local"
            name="endTime"
            value={lbpConfig.endTime}
            onChange={onLbpConfigChange}
          />
          <Input
            label="Start weight %"
            name="poolStartWeightToken"
            value={lbpConfig.poolStartWeightToken}
            onChange={onLbpConfigChange}
            placeholder="80"
          />
          <Input
            label="End weight %"
            name="poolEndWeightToken"
            value={lbpConfig.poolEndWeightToken}
            onChange={onLbpConfigChange}
            placeholder="20"
          />
          <Input
            label="Swap fee"
            name="poolSwapFee"
            value={lbpConfig.poolSwapFee}
            onChange={onLbpConfigChange}
            placeholder="0.003"
          />
          <Input
            label="Vesting cliff duration"
            name="vestingCliffDuration"
            value={lbpConfig.vestingCliffDuration}
            onChange={onLbpConfigChange}
            placeholder="0"
          />
          <Input
            label="Vesting duration"
            name="vestingFinalDuration"
            value={lbpConfig.vestingFinalDuration}
            onChange={onLbpConfigChange}
            placeholder="2592000"
          />
          <Input
            label="Cliff percent (BPS)"
            name="vestingCliffPercentBP"
            value={lbpConfig.vestingCliffPercentBP}
            onChange={onLbpConfigChange}
            placeholder="0"
          />
        </div>
      </div>
    </div>
  );
};

export default AuctionControls;
