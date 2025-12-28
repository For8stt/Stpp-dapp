import { ethers } from "ethers";

export const toDateInput = (secondsFromNow = 0) =>
  new Date((Math.floor(Date.now() / 1000) + secondsFromNow) * 1000).toISOString().slice(0, 16);

export const defaultAuctionForm = {
  saleToken: "",
  treasury: "",
  startTime: toDateInput(3600),
  commitDuration: "3600",
  revealDuration: "3600",
  tokensForSale: "",
  bonusReserve: "",
  perAddressCap: "",
  softCap: "",
  merkleRoot: ethers.ZeroHash,
  priceTicks: "1,0.9,0.8",
};

export const defaultLbpConfig = {
  startTime: toDateInput(10800), // +3 година від зараз
  endTime: toDateInput(21600), // +6 години від зараз (кінець через 1 годину після початку)
  poolStartWeightToken: "80",
  poolEndWeightToken: "20",
  poolSwapFee: "0.003",
  initialFeePreset: "1", // Default: 10% (enum value 1 = TEN_PERCENT)
  feeDecayDurationPreset: "1", // Default: 15 minutes (enum value 1 = FIFTEEN_MINUTES)
  vestingCliffDuration: "259200", // 3 days (3 * 24 * 60 * 60 = 259200 seconds)
  vestingFinalDuration: "2592000", // 30 days for LBP (30 * 24 * 60 * 60 = 2592000 seconds)
  vestingCliffPercentBP: "1500", // 15% (15 * 100 = 1500 BPS)
  maxContributionPerAddress: "5", // Default: 5 ETH
};

export const parseTimestamp = (value) => {
  if (!value) return Math.floor(Date.now() / 1000) + 600;
  const result = Math.floor(new Date(value).getTime() / 1000);
  return Number.isFinite(result) ? result : Math.floor(Date.now() / 1000) + 600;
};

export const parseEtherValue = (value) => (value ? ethers.parseUnits(value, 18).toString() : "0");

export const parseBps = (value) => Number(value || 0);

export const parseWeight = (value) => ethers.parseUnits(((Number(value || 0) / 100) || 0).toString(), 18).toString();

export const shortenHash = (hash) => {
  if (!hash) return "";
  if (hash.length <= 12) return hash;
  return `${hash.slice(0, 6)}…${hash.slice(-4)}`;
};

