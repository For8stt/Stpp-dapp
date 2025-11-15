// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../interfaces/IPresaleManager.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface ISecureLBPMinimal {
    function placeBid(uint256 minTokensOut) external payable;
    function finalizeToVesting(address vestingEscrow) external;
    function withdrawETH(uint256 amount) external;
    function unwindAllLiquidity() external;
    function rebalanceTo5050() external payable;
}

contract ReentrantTreasury {
    ISecureLBPMinimal public immutable lbp;
    uint256 public attemptAmount;
    bool public attempted;
    bool public success;
    bytes public lastData;

    constructor(address lbp_) {
        lbp = ISecureLBPMinimal(lbp_);
    }

    function setAttemptAmount(uint256 amount) external {
        attemptAmount = amount;
        attempted = false;
        success = false;
        lastData = "";
    }

    receive() external payable {
        if (!attempted && attemptAmount > 0) {
            attempted = true;
            (bool ok, bytes memory data) = address(lbp).call(
                abi.encodeWithSignature("withdrawETH(uint256)", attemptAmount)
            );
            success = ok;
            lastData = data;
        }
    }
}

contract ReentrantLBPPool {
    using SafeERC20 for IERC20;

    IERC20 public immutable token;
    ISecureLBPMinimal public immutable lbp;

    bool public reenterOnSwap;
    bool public reenterOnUnwind;
    bool public reenterOnRebalance;
    bool public lastReenterSuccess;
    bytes public lastRevertData;

    uint256 public lpBalanceHeld;
    uint256 public reserveEth;
    uint256 public reserveToken;
    uint256 public weightToken;
    uint256 public weightEth;

    constructor(address token_, address lbp_) {
        token = IERC20(token_);
        lbp = ISecureLBPMinimal(lbp_);
    }

    function setLPBalance(uint256 amount) external {
        lpBalanceHeld = amount;
    }

    function setReserves(uint256 ethReserve, uint256 tokenReserve) external {
        reserveEth = ethReserve;
        reserveToken = tokenReserve;
    }

    function setWeights(uint256 wToken, uint256 wEth) external {
        weightToken = wToken;
        weightEth = wEth;
    }

    function armReentrancy(
        bool swapAttempt,
        bool unwindAttempt,
        bool rebalanceAttempt
    ) external {
        reenterOnSwap = swapAttempt;
        reenterOnUnwind = unwindAttempt;
        reenterOnRebalance = rebalanceAttempt;
        lastReenterSuccess = false;
        lastRevertData = "";
    }

    function balanceLP(address account) external view returns (uint256) {
        if (account == address(lbp)) {
            return lpBalanceHeld;
        }
        return 0;
    }

    function swapETHForTokenTo(address to, uint256) external payable returns (uint256) {
        if (reenterOnSwap) {
            reenterOnSwap = false;
            (bool ok, bytes memory data) = address(lbp).call{value: msg.value}(
                abi.encodeWithSignature("placeBid(uint256)", 0)
            );
            lastReenterSuccess = ok;
            lastRevertData = data;
        } else {
            reserveEth += msg.value;
        }

        uint256 tokenOut = 1;
        require(reserveToken >= tokenOut, "insufficient tokens");
        reserveToken -= tokenOut;
        token.safeTransfer(to, tokenOut);
        return tokenOut;
    }

    function removeLiquidity(uint256 lpAmount) external {
        require(lpAmount <= lpBalanceHeld, "insufficient lp");

        if (reenterOnUnwind) {
            reenterOnUnwind = false;
            (bool ok, bytes memory data) = address(lbp).call(
                abi.encodeWithSignature("unwindAllLiquidity()")
            );
            lastReenterSuccess = ok;
            lastRevertData = data;
        }

        lpBalanceHeld -= lpAmount;

        uint256 tokenOut = 5;
        uint256 ethOut = 5;

        if (reserveToken >= tokenOut) reserveToken -= tokenOut;
        if (reserveEth >= ethOut) reserveEth -= ethOut;

        token.safeTransfer(address(lbp), tokenOut);
        (bool ok,) = payable(address(lbp)).call{value: ethOut}("");
        require(ok, "eth send failed");
    }

    function reserveETH() external view returns (uint256) {
        return reserveEth;
    }

    function currentWeights() external view returns (uint256, uint256) {
        return (weightToken, weightEth);
    }

    function addLiquiditySingleETH() external payable returns (uint256) {
        if (reenterOnRebalance) {
            reenterOnRebalance = false;
            (bool ok, bytes memory data) = address(lbp).call{value: msg.value}(
                abi.encodeWithSignature("rebalanceTo5050()")
            );
            lastReenterSuccess = ok;
            lastRevertData = data;
        }
        reserveEth += msg.value;
        return 0;
    }

    function addLiquiditySingleToken(uint256 tokenAmount) external {
        if (reenterOnRebalance) {
            reenterOnRebalance = false;
            (bool ok, bytes memory data) = address(lbp).call(
                abi.encodeWithSignature("rebalanceTo5050()")
            );
            lastReenterSuccess = ok;
            lastRevertData = data;
        }
        token.safeTransferFrom(msg.sender, address(this), tokenAmount);
        reserveToken += tokenAmount;
    }

    receive() external payable {
        reserveEth += msg.value;
    }
}

contract ReentrantPresaleManager is IPresaleManager {
    ISecureLBPMinimal public lbp;
    address public escrow;

    bool public reentryAttempted;
    bool public reentrySucceeded;
    bytes public reentryData;

    bool public finalizeSucceeded;
    bytes public finalizeData;

    function setContext(address lbp_) external {
        lbp = ISecureLBPMinimal(lbp_);
    }

    function setEscrow(address escrow_) external {
        escrow = escrow_;
    }

    function triggerFinalize(address escrow_) external {
        (bool ok, bytes memory data) = address(lbp).call(
            abi.encodeWithSignature("finalizeToVesting(address)", escrow_)
        );
        finalizeSucceeded = ok;
        finalizeData = data;
    }

    function finalizePresale(address, uint256, uint256) external override {
        if (!reentryAttempted && escrow != address(0)) {
            reentryAttempted = true;
            (bool ok, bytes memory data) = address(lbp).call(
                abi.encodeWithSignature("finalizeToVesting(address)", escrow)
            );
            reentrySucceeded = ok;
            reentryData = data;
        }
    }
    function notifyDemandCheck(address) external pure override {}

    function handleDemandCheck(address) external pure override {}
}
