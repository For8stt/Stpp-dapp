import React from "react";
import "../../pages/css/presalePage.css";

const ControlButton = ({ label, onClick, disabled }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className="control-button"
  >
    <span>{label}</span>
  </button>
);

const Input = ({ label, name, value, onChange, type = "text", placeholder }) => (
  <label className="control-input-label">
    <span>{label}</span>
    <input
      type={type}
      name={name}
      value={value}
      placeholder={placeholder}
      onChange={(event) => onChange(name, event.target.value)}
      className="control-input"
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
      <div className="owner-message">
        Only the owner of this presale manager can run administrative actions. Connect the wallet used to deploy the
        presale to unlock controls.
      </div>
    );
  }

  return (
    <div className="auction-controls-container">
      <div className="auction-controls-header">
        <div>
          <p className="auction-controls-title">Auction controls</p>
          <p className="auction-controls-description">Manage the Dutch auction and downstream LBP deployment.</p>
        </div>
        <div className="auction-controls-buttons">
          <ControlButton label="Finalize auction" onClick={onFinalizeAuction} disabled={disabled || !auctionAddress} />
          <ControlButton label="Launch LBP" onClick={onLaunchLbp} disabled={disabled || !auctionAddress} />
          <ControlButton label="Finalize LBP" onClick={onFinalizeLbp} disabled={disabled} />
          <ControlButton label="Unwind LBP" onClick={onUnwind} disabled={disabled} />
        </div>
      </div>

      <div className="lbp-config-section">
        <p className="lbp-config-title">LBP config override</p>
        <div className="lbp-config-grid">
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
