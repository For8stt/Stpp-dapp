import React from "react";

const ControlButton = ({ label, onClick, disabled }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className="rounded-lg border border-slate-600/50 bg-slate-700/50 px-5 py-2.5 text-sm font-semibold text-white transition-all hover:border-slate-500/70 hover:bg-slate-700/70 active:bg-slate-700/60 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-slate-600/50 disabled:hover:bg-slate-700/50"
  >
    {label}
  </button>
);

const Input = ({ label, name, value, onChange, type = "text", placeholder }) => (
  <label className="flex flex-col gap-2">
    <span className="text-xs font-medium uppercase tracking-wider text-white/70">{label}</span>
    <input
      type={type}
      name={name}
      value={value}
      placeholder={placeholder}
      onChange={(event) => onChange(name, event.target.value)}
      className="w-full rounded-xl border border-white/12 bg-gradient-to-br from-slate-950/90 to-slate-900/80 px-4 py-3 text-sm text-white shadow-[0_2px_8px_rgba(0,0,0,0.15),inset_0_1px_0_rgba(255,255,255,0.05)] outline-none transition-all duration-300 placeholder:text-white/40 hover:border-white/18 hover:shadow-[0_4px_12px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.08)] focus:border-indigo-500/60 focus:bg-gradient-to-br focus:from-slate-950/95 focus:to-slate-900/90 focus:shadow-[0_0_0_3px_rgba(99,102,241,0.15),0_4px_12px_rgba(99,102,241,0.2),inset_0_1px_0_rgba(255,255,255,0.1)] [&[type='datetime-local']]:font-mono [&[type='datetime-local']]:text-white/90 [&[type='datetime-local']::-webkit-calendar-picker-indicator]:invert [&[type='datetime-local']::-webkit-calendar-picker-indicator]:opacity-70 [&[type='datetime-local']::-webkit-calendar-picker-indicator]:cursor-pointer [&[type='datetime-local']::-webkit-calendar-picker-indicator]:transition-opacity [&[type='datetime-local']::-webkit-calendar-picker-indicator]:duration-200 hover:[&[type='datetime-local']::-webkit-calendar-picker-indicator]:opacity-100"
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
      <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900/70 to-slate-800/50 p-6 text-center text-sm text-white/80 shadow-[0_4px_12px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-[10px]">
        Only the owner of this presale manager can run administrative actions. Connect the wallet used to deploy the
        presale to unlock controls.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="m-0 text-xl font-semibold text-white">Auction controls</p>
          <p className="mt-1 mb-0 text-sm text-white/65">Manage the Dutch auction and downstream LBP deployment.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <ControlButton label="Finalize auction" onClick={onFinalizeAuction} disabled={disabled || !auctionAddress} />
          <ControlButton label="Launch LBP" onClick={onLaunchLbp} disabled={disabled || !auctionAddress} />
          <ControlButton label="Finalize LBP" onClick={onFinalizeLbp} disabled={disabled} />
          <ControlButton label="Unwind LBP" onClick={onUnwind} disabled={disabled} />
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-slate-900/80 to-slate-800/60 p-6 shadow-[0_4px_12px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-[10px]">
        <p className="mb-4 mt-0 flex items-center gap-2 text-sm font-semibold text-white before:content-['⚙️'] before:text-base">LBP config override</p>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
