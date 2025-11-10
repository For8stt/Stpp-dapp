// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "prb-math/contracts/PRBMathUD60x18.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "./events/WeightedAMMEvents.sol";
import "./errors/WeightedAMMErrors.sol";

contract LBPWeightedAMM is ReentrancyGuard, Pausable, Ownable, WeightedAMMEvents, WeightedAMMErrors {
    using SafeERC20 for IERC20;

    IERC20 public immutable token;
    uint256 public reserveToken;
    uint256 public reserveETH;

    uint256 public immutable swapFee; // in 1e18 fixed-point, e.g., 3e15 = 0.3%

    // LP simple
    uint256 public totalSupplyLP;
    mapping(address => uint256) public balanceLP;

    // ========== LBP dynamic weights ==========
    uint256 public startTime;
    uint256 public endTime;
    uint256 public startWeightToken; // e.g., 7e17
    uint256 public endWeightToken;   // e.g., 5e17

    uint256 public constant SCALE = 1e18;


    constructor(
        address _token,
        uint256 _startWeightToken,
        uint256 _endWeightToken,
        uint256 _startTime,
        uint256 _endTime,
        uint256 _swapFee
    ) {
        if (_token == address(0)) revert ZeroToken();
        if (_startTime >= _endTime) revert InvalidTimes();
        if (_startWeightToken == 0 || _endWeightToken == 0) revert WeightsZero();
        if (_startWeightToken > SCALE || _endWeightToken > SCALE) revert WeightAboveMax();
        if (_startWeightToken + _endWeightToken > SCALE * 2) revert InvalidWeightsSum();

        token = IERC20(_token);
        startWeightToken = _startWeightToken;
        endWeightToken = _endWeightToken;
        startTime = _startTime;
        endTime = _endTime;
        swapFee = _swapFee;
    }

    // ========= Helper =========
    function currentWeights() public view returns (uint256 weightTokenCurr, uint256 weightETHCurr) {
        if (block.timestamp <= startTime) {
            weightTokenCurr = startWeightToken;
        } else if (block.timestamp >= endTime) {
            weightTokenCurr = endWeightToken;
        } else {
            uint256 elapsed = block.timestamp - startTime;
            uint256 duration = endTime - startTime;

            uint256 weightDiff = startWeightToken > endWeightToken
                ? startWeightToken - endWeightToken
                : endWeightToken - startWeightToken;

            bool isDecreasing = startWeightToken > endWeightToken;

            unchecked {
                uint256 change = (weightDiff * elapsed) / duration;
                weightTokenCurr = isDecreasing
                    ? startWeightToken - change
                    : startWeightToken + change;
            }
        }
        weightETHCurr = SCALE - weightTokenCurr;
    }

    // ========= Add / Remove Liquidity =========
    function addLiquidity(uint256 tokenAmount) external payable whenNotPaused nonReentrant returns (uint256 lpMinted) {
        if (tokenAmount == 0 || msg.value == 0) revert ZeroAmounts();

        token.safeTransferFrom(msg.sender, address(this), tokenAmount);

        if (totalSupplyLP == 0) {
            lpMinted = _sqrt(tokenAmount * msg.value);
        } else {
            uint256 liqFromToken = (tokenAmount * totalSupplyLP) / reserveToken;
            uint256 liqFromEth = (msg.value * totalSupplyLP) / reserveETH;
            lpMinted = liqFromToken < liqFromEth ? liqFromToken : liqFromEth;
        }

        if (lpMinted == 0) revert ZeroLPMinted();

        reserveToken += tokenAmount;
        reserveETH += msg.value;

        balanceLP[msg.sender] += lpMinted;
        totalSupplyLP += lpMinted;

        emit LiquidityAdded(msg.sender, tokenAmount, msg.value, lpMinted);
    }

    function addLiquiditySingleETH() external payable onlyOwner whenNotPaused nonReentrant returns (uint256 lpMinted) {
        if (msg.value == 0) revert ZeroEth();
        if (totalSupplyLP == 0 || reserveETH == 0) revert PoolEmpty();

        lpMinted = (msg.value * totalSupplyLP) / reserveETH;
        if (lpMinted == 0) revert ZeroLPMinted();

        reserveETH += msg.value;

        balanceLP[msg.sender] += lpMinted;
        totalSupplyLP += lpMinted;

        emit LiquidityAddedSingle(msg.sender, 0, msg.value, lpMinted);
    }

    function addLiquiditySingleToken(uint256 tokenAmount) external onlyOwner whenNotPaused nonReentrant returns (uint256 lpMinted) {
        if (tokenAmount == 0) revert ZeroTokenAmount();
        if (totalSupplyLP == 0 || reserveToken == 0) revert PoolEmpty();

        token.safeTransferFrom(msg.sender, address(this), tokenAmount);

        lpMinted = (tokenAmount * totalSupplyLP) / reserveToken;
        if (lpMinted == 0) revert ZeroLPMinted();

        reserveToken += tokenAmount;

        balanceLP[msg.sender] += lpMinted;
        totalSupplyLP += lpMinted;

        emit LiquidityAddedSingle(msg.sender, tokenAmount, 0, lpMinted);
    }

    function removeLiquidity(uint256 lpAmount) external nonReentrant whenNotPaused {
        if (lpAmount == 0 || balanceLP[msg.sender] < lpAmount) revert InvalidLP();

        uint256 tokenOut = (reserveToken * lpAmount) / totalSupplyLP;
        uint256 ethOut = (reserveETH * lpAmount) / totalSupplyLP;

        reserveToken -= tokenOut;
        reserveETH -= ethOut;

        balanceLP[msg.sender] -= lpAmount;
        totalSupplyLP -= lpAmount;

        token.safeTransfer(msg.sender, tokenOut);
        (bool ok,) = payable(msg.sender).call{value: ethOut}("");
        if (!ok) revert EthTransferFailed();

        emit LiquidityRemoved(msg.sender, tokenOut, ethOut, lpAmount);
    }

    // ========= Swaps =========
    function swapTokenForETH(uint256 tokenIn, uint256 minEthOut) external nonReentrant whenNotPaused returns (uint256 ethOut) {
        if (tokenIn == 0) revert ZeroTokenInput();
        token.safeTransferFrom(msg.sender, address(this), tokenIn);

        unchecked {
            uint256 feeAmount = (tokenIn * swapFee) / SCALE;
            uint256 tokenInAfterFee = tokenIn - feeAmount;
            if (tokenInAfterFee == 0) revert ZeroAfterFee();

            (uint256 wToken, uint256 wETH) = currentWeights();

            ethOut = _calcOutGivenIn(reserveToken, reserveETH, wToken, wETH, tokenInAfterFee);
            if (ethOut < minEthOut) revert SlippageExceeded();

            reserveToken += tokenIn;
            reserveETH -= ethOut;

            (bool ok,) = payable(msg.sender).call{value: ethOut}("");
            if (!ok) revert EthTransferFailed();

            emit SwapTokenForETH(msg.sender, tokenIn, ethOut, feeAmount);
        }
    }

    function swapETHForToken(uint256 minTokenOut) external payable nonReentrant whenNotPaused returns (uint256 tokenOut) {
        return _swapETHForToken(msg.sender, minTokenOut);
    }

    function swapETHForTokenTo(address to, uint256 minTokenOut) external payable nonReentrant whenNotPaused returns (uint256 tokenOut) {
        if (to == address(0)) revert ZeroRecipient();
        return _swapETHForToken(to, minTokenOut);
    }

    function _swapETHForToken(address to, uint256 minTokenOut) internal returns (uint256 tokenOut) {
        if (msg.value == 0) revert ZeroEth();
        unchecked {
            uint256 feeAmount = (msg.value * swapFee) / SCALE;
            uint256 ethInAfterFee = msg.value - feeAmount;
            if (ethInAfterFee == 0) revert ZeroAfterFee();

            (uint256 wToken, uint256 wETH) = currentWeights();

            tokenOut = _calcOutGivenIn(reserveETH, reserveToken, wETH, wToken, ethInAfterFee);

            if (tokenOut < minTokenOut) revert SlippageExceeded();
            if (token.balanceOf(address(this)) < tokenOut) revert InsufficientTokenBalance();

            reserveETH += msg.value;
            reserveToken -= tokenOut;

            token.safeTransfer(to, tokenOut);

            emit SwapETHForToken(msg.sender, msg.value, tokenOut, feeAmount);
        }
        return tokenOut;
    }


    // ========= Quote Functions (for external use, e.g., SecureLBP) =========
    /// @notice Quote tokens out for ETH in (includes pool fee, view).
    function quoteETHForToken(uint256 ethIn) external view returns (uint256 tokenOut) {
        if (ethIn == 0) return 0;
        uint256 feeAmount = (ethIn * swapFee) / SCALE;
        uint256 ethInAfterFee = ethIn - feeAmount;
        (uint256 wToken, uint256 wETH) = currentWeights();
        return _calcOutGivenIn(reserveETH, reserveToken, wETH, wToken, ethInAfterFee);
    }

    /// @notice Quote ETH out for token in (includes pool fee, view).
    function quoteTokenForETH(uint256 tokenIn) external view returns (uint256 ethOut) {
        if (tokenIn == 0) return 0;
        uint256 feeAmount = (tokenIn * swapFee) / SCALE;
        uint256 tokenInAfterFee = tokenIn - feeAmount;
        (uint256 wToken, uint256 wETH) = currentWeights();
        return _calcOutGivenIn(reserveToken, reserveETH, wToken, wETH, tokenInAfterFee);
    }

    // ========= Core math =========
    function _calcOutGivenIn(
        uint256 balanceIn,
        uint256 balanceOut,
        uint256 weightIn,
        uint256 weightOut,
        uint256 amountIn
    ) internal pure returns (uint256) {
        if (balanceIn == 0 || balanceOut == 0) revert EmptyPoolState();

        // Rewritten to avoid log2 on value <1: use b = (balIn + in)/balIn >1, then 1 - 1/b^y
        uint256 b = (balanceIn + amountIn) * SCALE / balanceIn;
        uint256 y = (weightIn * SCALE) / weightOut;
        uint256 power = PRBMathUD60x18.pow(b, y);
        uint256 invPower = PRBMathUD60x18.div(SCALE, power);
        uint256 factor = SCALE - invPower;

        return (balanceOut * factor) / SCALE;
    }

    /// @notice Return current token weight in 1e18 fixed-point
    function getCurrentWeightToken() external view returns (uint256) {
        (uint256 wToken, ) = currentWeights();
        return wToken;
    }

    /// @notice Return current ETH weight in 1e18 fixed-point
    function getCurrentWeightETH() external view returns (uint256) {
        (, uint256 wETH) = currentWeights();
        return wETH;
    }


    // ========= Utilities =========
    function _sqrt(uint256 x) internal pure returns (uint256 y) {
        if (x == 0) return 0;
        uint256 z = (x + 1) / 2;
        y = x;
        while (z < y) {
            y = z;
            z = (x / z + z) / 2;
        }
    }

    receive() external payable {}
}
