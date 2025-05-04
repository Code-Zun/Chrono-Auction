// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title MaliciousToken
 * @dev Mock token that fails on transfers for testing error handling
 */
contract MaliciousToken is ERC20 {
    constructor() ERC20("Malicious Token", "EVIL") {}
    
    /**
     * @dev Mints tokens to an address
     * @param to Address to mint tokens to
     * @param amount Amount of tokens to mint
     */
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
    
    /**
     * @dev Override transfer to always return false
     */
    function transfer(address, uint256) public pure override returns (bool) {
        return false;
    }
    
    /**
     * @dev Override transferFrom to always return false
     */
    function transferFrom(address, address, uint256) public pure override returns (bool) {
        return false;
    }
}