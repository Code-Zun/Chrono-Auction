// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title ParticipationToken
 * @dev Simple ERC20 for rewarding bidders
 */
contract ParticipationToken is ERC20, Ownable { 
    mapping(address => bool) public allowedAuctions; 

    constructor() ERC20("Participation Points", "PP") Ownable(msg.sender){}

    function addAllowedAuction(address auction) external onlyOwner {
        allowedAuctions[auction] = true; 
    }

    function mint(address to) external {
        require(allowedAuctions[msg.sender], "Only approved auctions"); 
        _mint(to, 1 * 10**decimals()); // 1 PP per bid
    }
}

