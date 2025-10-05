// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract MockPresaleManager {
    event AuctionFinalized(address auction);
    event TransitionToLBPCalled(uint256 collected, uint256 remainingTokens);

    // Ця функція викликається DutchAuction при успішному завершенні
    function transitionToLBP(uint256 collectedETH, uint256 remainingTokens) external payable {
        // Проста емуляція: приймаємо ETH і емітимо подію
        emit TransitionToLBPCalled(collectedETH, remainingTokens);
    }

    // Функція для провалу аукціону
    function handleFailedAuction(uint256 collectedETH) external {
        // Можна емінтити подію для перевірки
        emit AuctionFinalized(address(0));
    }

    // Щоб контракт міг отримувати ETH через transfer()
    receive() external payable {}
}
