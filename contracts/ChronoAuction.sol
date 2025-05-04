// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./ParticipationToken.sol";

/**
 * @title ChronoAuction
 * @dev An auction contract that extends bidding time when bids are placed close to the end.
 * Participants receive participation tokens for bidding.
 */
contract ChronoAuction is ReentrancyGuard {
    // Immutable state variables that cannot be changed after deployment
    IERC20 public immutable bidToken;              // ERC20 token used for bidding
    ParticipationToken public immutable rewardToken; // Token rewarded to bidders
    address public immutable beneficiary;           // Address that receives the highest bid
    
    // Auction state
    uint public endTime;                           
    uint public highestBid;                        
    address public highestBidder;                  
    bool public settled = false;                

    // Events for easier tracking of auction activity
    event BidPlaced(address indexed bidder, uint amount);
    event AuctionExtended(uint newEndTime);
    event AuctionSettled(address winner, uint amount);

    /**
     * @dev Sets up the auction with the specified parameters
     * @param _bidToken Address of the ERC20 token used for bidding
     * @param _duration Duration of the auction in seconds
     * @param _rewardToken Address of the participation token
     * @param _beneficiary Address that will receive the highest bid
     */
    constructor(
        address _bidToken, 
        uint _duration, 
        address _rewardToken,
        address _beneficiary
    ) {
        require(_beneficiary != address(0), "Invalid beneficiary");
        bidToken = IERC20(_bidToken);
        rewardToken = ParticipationToken(_rewardToken);
        endTime = block.timestamp + _duration;
        beneficiary = _beneficiary;
    }

    /**
     * @dev Place a bid in the auction
     * @param amount Amount of bid tokens to bid
     */
    function bid(uint amount) external nonReentrant {
        // Check if auction is still active
        require(block.timestamp < endTime, "Auction ended");
        require(amount > highestBid, "Bid too low");
        
        // Refund the previous highest bidder
        if (highestBidder != address(0)) {
            require(bidToken.transfer(highestBidder, highestBid), "Refund failed");
        }
        
        // Transfer tokens from bidder to the contract
        require(bidToken.transferFrom(msg.sender, address(this), amount), "Transfer failed");
        
        // Update auction state
        highestBid = amount;
        highestBidder = msg.sender;
        
        // Extend auction if bid is placed in the last 5 minutes
        if (endTime - block.timestamp < 5 minutes) {
            endTime += 5 minutes;
            emit AuctionExtended(endTime);
        }
        
        // Reward bidder with participation token
        rewardToken.mint(msg.sender);
        
        emit BidPlaced(msg.sender, amount);
    }

    /**
     * @dev Settle the auction and transfer the highest bid to the beneficiary
     * Can only be called after the auction has ended
     */
    function withdraw() external nonReentrant {
        require(block.timestamp > endTime, "Auction ongoing");
        require(!settled, "Already settled");
        require(highestBidder != address(0), "No bids placed");
        
        settled = true;
        
        // Transfer highest bid to the beneficiary
        require(bidToken.transfer(beneficiary, highestBid), "Withdraw failed");
        
        emit AuctionSettled(highestBidder, highestBid);
    }
}