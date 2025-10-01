// SPDX-License-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./DutchAuction.sol";
import "./SecureLBP.sol";
import "./TestVesting.sol";

contract PresaleManager is Ownable {
    using SafeERC20 for IERC20;

    IERC20 public immutable token;
    DutchAuction public immutable dutchAuction;
    SecureLBP public immutable secureLBP;
    TestVesting public immutable vesting;
    address public treasury;

    uint256 public constant LIQUIDITY_PERCENT = 30; // 30% коштів для майбутньої ліквідності

    event PhaseStarted(string phase);
    event TokensTransferred(address from, address to, uint256 amount);
    event FundsWithdrawn(uint256 amount);

    constructor(
        address _token,
        address _treasury,
        uint256 _startTime,
        uint256 _auctionDuration,
        uint256 _lbpCommitDuration,
        uint256 _lbpRevealDuration,
        uint256 _startPrice,
        uint256 _reservePrice,
        uint256 _totalTokens,
        uint256 _softCap,
        uint256 _earlyBonusDurationSeconds
    ) {
        require(_token != address(0), "zero token");
        require(_treasury != address(0), "zero treasury");
        require(_startTime > block.timestamp, "invalid start time");
        require(_auctionDuration > 0 && _lbpCommitDuration > 0 && _lbpRevealDuration > 0, "invalid durations");

        token = IERC20(_token);
        treasury = _treasury;

        // Розгортаємо DutchAuction з усіма параметрами
        dutchAuction = new DutchAuction(
            _token,
            _startTime,
            _startTime + _auctionDuration, // endTime = startTime + auctionDuration
            _startPrice,
            _reservePrice,
            _totalTokens,
            _softCap,
            _earlyBonusDurationSeconds
        );

        // Розгортаємо SecureLBP
        uint256 lbpStart = _startTime + _auctionDuration;
        secureLBP = new SecureLBP(
            _token,
            lbpStart,
            lbpStart + _lbpCommitDuration,
            lbpStart + _lbpCommitDuration + _lbpRevealDuration,
            _treasury
        );

        // Розгортаємо TestVesting
        vesting = new TestVesting(); // Видалено _vestingDuration
    }

    function startPresale(uint256 tokenAmount) external onlyOwner {
        require(tokenAmount > 0, "zero tokens");
        require(token.balanceOf(address(this)) >= tokenAmount, "insufficient tokens");
        token.safeTransfer(address(dutchAuction), tokenAmount);
        emit PhaseStarted("Dutch Auction Started");
    }

    function transitionToLBP() external onlyOwner {
        uint256 remainingTokens = dutchAuction.finalize();
        token.safeTransfer(address(secureLBP), remainingTokens);
        emit TokensTransferred(address(dutchAuction), address(secureLBP), remainingTokens);
        emit PhaseStarted("LBP Started");
    }

    function finalizePresale(address[] calldata beneficiaries, uint256[] calldata amounts) external onlyOwner {
        secureLBP.finalizeToVesting(address(vesting), beneficiaries);
        uint256 collected = secureLBP.collectedETH();
        uint256 liquidityAmount = (collected * LIQUIDITY_PERCENT) / 100;
        secureLBP.withdrawETH(payable(treasury), liquidityAmount); // Відправляємо ETH до treasury
        emit FundsWithdrawn(liquidityAmount);
        emit PhaseStarted("Presale Finalized");
    }

    function setTreasury(address _treasury) external onlyOwner {
        require(_treasury != address(0), "zero treasury");
        treasury = _treasury;
    }
}