// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./ChronoAuction.sol";
import "./ParticipationToken.sol";

error InvalidTokenAddress();
error InvalidDuration();
error AuctionCreationPaused();
error BatchTooLarge();
error TokenAlreadySupported();
error TokenNotSupported();
error StartIndexOutOfBounds();

contract AuctionFactory is Ownable {
    ParticipationToken public immutable rewardToken;
    address[] public auctions;
    mapping(address => bool) public supportedBidTokens;
    mapping(address => address) public auctionOwner;
    
    uint public minAuctionDuration = 1 hours;
    uint public maxAuctionDuration = 30 days;
    uint public constant MAX_BATCH_SIZE = 100;
    bool public paused;

    event AuctionCreated(address indexed auctionAddress, address indexed creator, address indexed bidToken, uint duration, address beneficiary);
    event BidTokenAdded(address indexed tokenAddress);
    event BidTokenRemoved(address indexed tokenAddress);
    event DurationLimitsUpdated(uint min, uint max);
    event PauseUpdated(bool paused);

    constructor(address _rewardToken) Ownable(msg.sender) {
        require(_rewardToken != address(0), "Invalid reward token");
        require(_rewardToken.code.length > 0, "Not a contract");
        rewardToken = ParticipationToken(_rewardToken);
    }

    function createAuction(address _bidToken, uint _duration, address _beneficiary) 
        external 
        whenNotPaused 
        returns (address) 
    {
        if (!supportedBidTokens[_bidToken]) revert InvalidTokenAddress();
        if (_duration < minAuctionDuration || _duration > maxAuctionDuration) revert InvalidDuration();
        if (_beneficiary == address(0)) revert InvalidTokenAddress();

        ChronoAuction newAuction = new ChronoAuction(
            _bidToken,
            _duration,
            address(rewardToken),
            _beneficiary
        );

        address auctionAddress = address(newAuction);
        rewardToken.addAllowedAuction(auctionAddress);
        auctions.push(auctionAddress);
        auctionOwner[auctionAddress] = msg.sender;

        emit AuctionCreated(auctionAddress, msg.sender, _bidToken, _duration, _beneficiary);
        return auctionAddress;
    }

    function setDurationLimits(uint _min, uint _max) external onlyOwner {
        if (_min >= _max) revert InvalidDuration();
        minAuctionDuration = _min;
        maxAuctionDuration = _max;
        emit DurationLimitsUpdated(_min, _max);
    }

    function emergencyPause(bool _pause) external onlyOwner {
        paused = _pause;
        emit PauseUpdated(_pause);
    }

    modifier whenNotPaused() {
        if (paused) revert AuctionCreationPaused();
        _;
    }

    // Add these missing functions:

    /**
     * @dev Adds a token to the list of supported bid tokens
     * @param _tokenAddress Address of the ERC20 token to add
     */
    function addSupportedBidToken(address _tokenAddress) external onlyOwner {
        if (_tokenAddress == address(0)) revert InvalidTokenAddress();
        if (_tokenAddress.code.length == 0) revert InvalidTokenAddress();
        if (supportedBidTokens[_tokenAddress]) revert TokenAlreadySupported();
        
        // Basic ERC20 check - try to call totalSupply
        try IERC20(_tokenAddress).totalSupply() {
            // Success - it's likely an ERC20
        } catch {
            // Failed to call totalSupply - not an ERC20
            revert InvalidTokenAddress();
        }
        
        supportedBidTokens[_tokenAddress] = true;
        emit BidTokenAdded(_tokenAddress);
    }

    /**
     * @dev Removes a token from the list of supported bid tokens
     * @param _tokenAddress Address of the ERC20 token to remove
     */
    function removeSupportedBidToken(address _tokenAddress) external onlyOwner {
        if (!supportedBidTokens[_tokenAddress]) revert TokenNotSupported();
        
        supportedBidTokens[_tokenAddress] = false;
        emit BidTokenRemoved(_tokenAddress);
    }

    /**
     * @dev Returns the total number of auctions created
     * @return Number of auctions
     */
    function getAuctionCount() external view returns (uint) {
        return auctions.length;
    }

    /**
     * @dev Returns a list of auctions within a specified range
     * @param _start Starting index
     * @param _count Number of auctions to return
     * @return List of auction addresses
     */
    function getAuctions(uint _start, uint _count) external view returns (address[] memory) {
        if (_count > MAX_BATCH_SIZE) revert BatchTooLarge();
        if (_start >= auctions.length) revert StartIndexOutOfBounds();
        
        // Adjust count if it exceeds array bounds
        if (_start + _count > auctions.length) {
            _count = auctions.length - _start;
        }
        
        address[] memory result = new address[](_count);
        
        for (uint i = 0; i < _count; i++) {
            result[i] = auctions[_start + i];
        }
        
        return result;
    }
}