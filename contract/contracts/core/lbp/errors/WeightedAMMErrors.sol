// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

abstract contract WeightedAMMErrors {
    error ZeroToken();
    error InvalidTimes();
    error WeightsZero();
    error WeightAboveMax();
    error InvalidWeightsSum();
    error ZeroAmounts();
    error ZeroTokenAmount();
    error ZeroLPMinted();
    error ZeroEth();
    error PoolEmpty();
    error ZeroTokenInput();
    error InvalidLP();
    error EthTransferFailed();
    error SlippageExceeded();
    error ZeroRecipient();
    error InsufficientTokenBalance();
    error EmptyPoolState();
    error ZeroAfterFee();
}
