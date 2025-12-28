// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title MockUniswapV3
 * @notice Simple mocks for Uniswap V3 contracts for localhost testing
 * These are minimal implementations that allow the SecureLBP contract to work
 * without deploying full Uniswap V3 infrastructure.
 */

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

// Mock Uniswap V3 Factory
contract MockUniswapV3Factory {
    mapping(address => mapping(address => mapping(uint24 => address))) public getPool;
    
    function createPool(
        address tokenA,
        address tokenB,
        uint24 fee
    ) external returns (address pool) {
        // Return a mock pool address (just use a deterministic address)
        pool = address(uint160(uint256(keccak256(abi.encodePacked(tokenA, tokenB, fee)))));
        getPool[tokenA][tokenB][fee] = pool;
        getPool[tokenB][tokenA][fee] = pool;
        return pool;
    }
}

// Mock NonfungiblePositionManager
contract MockNonfungiblePositionManager {
    struct MintParams {
        address token0;
        address token1;
        uint24 fee;
        int24 tickLower;
        int24 tickUpper;
        uint256 amount0Desired;
        uint256 amount1Desired;
        uint256 amount0Min;
        uint256 amount1Min;
        address recipient;
        uint256 deadline;
    }
    
    uint256 public nextTokenId = 1;
    mapping(uint256 => address) public ownerOf;
    
    function createAndInitializePoolIfNecessary(
        address /* token0 */,
        address /* token1 */,
        uint24 /* fee */,
        uint160 /* sqrtPriceX96 */
    ) external pure returns (address pool) {
        // Return a mock pool address (deterministic)
        pool = address(uint160(uint256(keccak256(abi.encodePacked("mock_pool")))));
        return pool;
    }
    
    function mint(MintParams calldata params)
        external
        payable
        returns (
            uint256 tokenId,
            uint128 liquidity,
            uint256 amount0,
            uint256 amount1
        )
    {
        tokenId = nextTokenId++;
        ownerOf[tokenId] = params.recipient;
        liquidity = 1; // Mock liquidity
        
        // In real Uniswap V3, mint() transfers tokens from the caller to the pool
        // We need to simulate this by transferring tokens from msg.sender (SecureLBP) to this contract
        // This ensures tokens are actually moved out of SecureLBP
        
        // Transfer token0 if it's not WETH (WETH is handled via msg.value)
        if (params.token0 != address(0)) {
            // Check if token0 is the token (not WETH)
            // In real Uniswap, this would be handled by the pool, but for mocks we transfer directly
            try IERC20(params.token0).transferFrom(msg.sender, address(this), params.amount0Desired) returns (bool success) {
                if (!success) revert("Token0 transfer failed");
            } catch {
                revert("Token0 transfer failed");
            }
        }
        
        // Transfer token1 if it's not WETH
        if (params.token1 != address(0)) {
            try IERC20(params.token1).transferFrom(msg.sender, address(this), params.amount1Desired) returns (bool success) {
                if (!success) revert("Token1 transfer failed");
            } catch {
                revert("Token1 transfer failed");
            }
        }

        amount0 = params.amount0Desired;
        amount1 = params.amount1Desired;
        return (tokenId, liquidity, amount0, amount1);
    }
    
    function positions(uint256 /* tokenId */)
        external
        pure
        returns (
            uint96 nonce,
            address operator,
            address token0,
            address token1,
            uint24 fee,
            int24 tickLower,
            int24 tickUpper,
            uint128 liquidity,
            uint256 feeGrowthInside0LastX128,
            uint256 feeGrowthInside1LastX128,
            uint128 tokensOwed0,
            uint128 tokensOwed1
        )
    {
        return (0, address(0), address(0), address(0), 0, 0, 0, 0, 0, 0, 0, 0);
    }
}

// Mock WETH9 (minimal implementation for testing)
contract MockWETH9 {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    
    uint256 public totalSupply;
    
    function deposit() external payable {
        balanceOf[msg.sender] += msg.value;
        totalSupply += msg.value;
        emit Transfer(address(0), msg.sender, msg.value);
    }
    
    function withdraw(uint256 amount) external {
        require(balanceOf[msg.sender] >= amount, "Insufficient balance");
        balanceOf[msg.sender] -= amount;
        totalSupply -= amount;
        emit Transfer(msg.sender, address(0), amount);
        payable(msg.sender).transfer(amount);
    }
    
    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }
    
    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "Insufficient balance");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        emit Transfer(msg.sender, to, amount);
        return true;
    }
    
    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(balanceOf[from] >= amount, "Insufficient balance");
        require(allowance[from][msg.sender] >= amount, "Insufficient allowance");
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        allowance[from][msg.sender] -= amount;
        emit Transfer(from, to, amount);
        return true;
    }
}

