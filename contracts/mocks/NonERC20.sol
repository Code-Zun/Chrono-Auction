// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

/**
 * @title NonERC20
 * @dev Mock contract that doesn't implement the ERC20 interface
 * Used exclusively for testing token validation in the AuctionFactory
 */
contract NonERC20 {
    // This contract intentionally doesn't implement any ERC20 functions
    // It's used to test that the AuctionFactory correctly rejects non-ERC20 tokens
    
    // Some random function to make it a valid contract
    function dummy() external pure returns (bool) {
        return true;
    }
    
    // Note: Specifically missing totalSupply(), transfer(), etc.
}