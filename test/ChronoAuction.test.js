const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("ChronoAuction Contract", function () {
  let auction;
  let bidToken;
  let rewardToken;
  let owner, bidder1, bidder2, beneficiary, nonParticipant;

  // Test constants
  const AUCTION_DURATION = 3600; // 1 hour in seconds
  const BID_AMOUNT = ethers.parseEther("1.0");
  const HIGHER_BID = ethers.parseEther("1.5");
  const MUCH_HIGHER_BID = ethers.parseEther("3.0");
  const TIME_EXTENSION = 5 * 60; // 5 minutes in seconds

  beforeEach(async function () {
    // Get signers
    [owner, bidder1, bidder2, beneficiary, nonParticipant] = await ethers.getSigners();

    console.log("Deploying mock token...");
    // Deploy Mock Bid Token
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    bidToken = await MockERC20.deploy("Bid Token", "BID");
    await bidToken.waitForDeployment();
    const bidTokenAddress = await bidToken.getAddress();
    console.log("Bid token deployed at:", bidTokenAddress);
    
    console.log("Deploying participation token...");
    // Deploy Participation Token
    const ParticipationToken = await ethers.getContractFactory("ParticipationToken");
    rewardToken = await ParticipationToken.deploy();
    await rewardToken.waitForDeployment();
    const rewardTokenAddress = await rewardToken.getAddress();
    console.log("Reward token deployed at:", rewardTokenAddress);
    
    console.log("Deploying auction...");
    // Deploy Auction Contract
    const ChronoAuction = await ethers.getContractFactory("ChronoAuction");
    auction = await ChronoAuction.deploy(
      bidTokenAddress,
      AUCTION_DURATION,
      rewardTokenAddress,
      beneficiary.address
    );
    await auction.waitForDeployment();
    const auctionAddress = await auction.getAddress();
    console.log("Auction deployed at:", auctionAddress);

    // Configure Participation Token
    console.log("Adding auction to allowed list...");
    await rewardToken.addAllowedAuction(auctionAddress);

    // Fund bidders
    console.log("Funding bidders...");
    await bidToken.mint(bidder1.address, ethers.parseEther("100"));
    await bidToken.mint(bidder2.address, ethers.parseEther("100"));
    
    // Approve auction contract
    console.log("Approving tokens...");
    await bidToken.connect(bidder1).approve(auctionAddress, ethers.parseEther("100"));
    await bidToken.connect(bidder2).approve(auctionAddress, ethers.parseEther("100"));
    
    console.log("Setup complete.");
  });

  describe("Deployment", function () {
    it("Should set correct initial values", async function () {
      const bidTokenAddress = await bidToken.getAddress();
      const rewardTokenAddress = await rewardToken.getAddress();
      
      expect(await auction.bidToken()).to.equal(bidTokenAddress);
      expect(await auction.rewardToken()).to.equal(rewardTokenAddress);
      expect(await auction.beneficiary()).to.equal(beneficiary.address);
      expect(await auction.highestBidder()).to.equal(ethers.ZeroAddress);
      expect(await auction.highestBid()).to.equal(0n);
      expect(await auction.settled()).to.equal(false);
      
      const currentTime = await time.latest();
      const endTime = await auction.endTime();
      // Using closeTo for BigInt comparisons
      expect(Number(endTime)).to.be.closeTo(
        Number(BigInt(currentTime) + BigInt(AUCTION_DURATION)), 
        5 // Allow small variance due to block time variations
      );
    });
  });

  describe("Bidding", function () {
    it("Should accept initial bid", async function () {
      await expect(auction.connect(bidder1).bid(BID_AMOUNT))
        .to.emit(auction, "BidPlaced")
        .withArgs(bidder1.address, BID_AMOUNT);

      expect(await auction.highestBidder()).to.equal(bidder1.address);
      expect(await auction.highestBid()).to.equal(BID_AMOUNT);
    });

    it("Should accept higher bids", async function () {
      // First bid
      await auction.connect(bidder1).bid(BID_AMOUNT);
      
      // Higher bid
      await expect(auction.connect(bidder2).bid(HIGHER_BID))
        .to.emit(auction, "BidPlaced")
        .withArgs(bidder2.address, HIGHER_BID);
        
      expect(await auction.highestBidder()).to.equal(bidder2.address);
      expect(await auction.highestBid()).to.equal(HIGHER_BID);
    });

    it("Should refund previous highest bidder", async function () {
      // First bid
      await auction.connect(bidder1).bid(BID_AMOUNT);
      const initialBalance = await bidToken.balanceOf(bidder1.address);

      // Higher bid
      await auction.connect(bidder2).bid(HIGHER_BID);
      
      // Check refund
      const finalBalance = await bidToken.balanceOf(bidder1.address);
      // In ethers v6, you need to use add method on BigNumber
      expect(finalBalance).to.equal(initialBalance + BID_AMOUNT);
    });

    it("Should reject bids lower than the current highest bid", async function () {
      // First bid
      await auction.connect(bidder1).bid(HIGHER_BID);
      
      // Try lower bid
      await expect(auction.connect(bidder2).bid(BID_AMOUNT))
        .to.be.revertedWith("Bid too low");
    });

    it("Should reject bids equal to current high bid", async function () {
      await auction.connect(bidder1).bid(BID_AMOUNT);
      
      await expect(auction.connect(bidder2).bid(BID_AMOUNT))
        .to.be.revertedWith("Bid too low");
    });

    it("Should extend auction time on late bids", async function () {
      // Move to 4 minutes before end
      await time.increase(AUCTION_DURATION - 240);
      
      const initialEndTime = await auction.endTime();
      
      await expect(auction.connect(bidder1).bid(BID_AMOUNT))
        .to.emit(auction, "AuctionExtended")
        .withArgs(initialEndTime + BigInt(TIME_EXTENSION));
      
      const newEndTime = await auction.endTime();
      expect(newEndTime).to.equal(initialEndTime + BigInt(TIME_EXTENSION));
    });

    it("Should not extend time if bid is not in last 5 minutes", async function () {
      // Move to 10 minutes before end
      await time.increase(AUCTION_DURATION - 600);
      
      const initialEndTime = await auction.endTime();
      await auction.connect(bidder1).bid(BID_AMOUNT);
      
      const newEndTime = await auction.endTime();
      expect(newEndTime).to.equal(initialEndTime);
    });

    it("Should reject bids after auction end", async function () {
      // Advance time past the auction end
      await time.increase(AUCTION_DURATION + 10);
      
      // Try to bid
      await expect(auction.connect(bidder1).bid(BID_AMOUNT))
        .to.be.revertedWith("Auction ended");
    });

    it("Should handle multiple bids from same bidder", async function () {
      // First bid
      await auction.connect(bidder1).bid(BID_AMOUNT);
      expect(await rewardToken.balanceOf(bidder1.address)).to.equal(ethers.parseEther("1"));
      
      // Same bidder places higher bid
      await auction.connect(bidder1).bid(HIGHER_BID);
      
      // Check state
      expect(await auction.highestBidder()).to.equal(bidder1.address);
      expect(await auction.highestBid()).to.equal(HIGHER_BID);
      
      // Check they received another token
      expect(await rewardToken.balanceOf(bidder1.address)).to.equal(ethers.parseEther("2"));
    });

    it("Should correctly handle bidding sequence between multiple users", async function () {
      // Series of escalating bids
      await auction.connect(bidder1).bid(BID_AMOUNT);
      await auction.connect(bidder2).bid(HIGHER_BID);
      await auction.connect(bidder1).bid(MUCH_HIGHER_BID);
      
      // Final state checks
      expect(await auction.highestBidder()).to.equal(bidder1.address);
      expect(await auction.highestBid()).to.equal(MUCH_HIGHER_BID);
      expect(await rewardToken.balanceOf(bidder1.address)).to.equal(ethers.parseEther("2"));
      expect(await rewardToken.balanceOf(bidder2.address)).to.equal(ethers.parseEther("1"));
    });
  });

  describe("Withdrawals", function () {
    it("Should transfer funds to beneficiary after settlement", async function () {
      await auction.connect(bidder1).bid(BID_AMOUNT);
      await time.increase(AUCTION_DURATION + 1);

      const initialBalance = await bidToken.balanceOf(beneficiary.address);
      
      await expect(auction.withdraw())
        .to.emit(auction, "AuctionSettled")
        .withArgs(bidder1.address, BID_AMOUNT);
      
      const finalBalance = await bidToken.balanceOf(beneficiary.address);
      expect(finalBalance).to.equal(initialBalance + BID_AMOUNT);
    });

    it("Should prevent withdrawal before auction end", async function () {
      await auction.connect(bidder1).bid(BID_AMOUNT);
      
      await expect(auction.withdraw())
        .to.be.revertedWith("Auction ongoing");
    });

    it("Should prevent withdrawal when no bids placed", async function () {
      await time.increase(AUCTION_DURATION + 1);
      
      await expect(auction.withdraw())
        .to.be.revertedWith("No bids placed");
    });

    it("Should prevent double settlement", async function () {
      await auction.connect(bidder1).bid(BID_AMOUNT);
      await time.increase(AUCTION_DURATION + 1);
      
      await auction.withdraw();
      expect(await auction.settled()).to.equal(true);
      
      await expect(auction.withdraw())
        .to.be.revertedWith("Already settled");
    });

    it("Should handle settlement after multiple extensions", async function () {
        // Place bid near end to extend
        await time.increase(AUCTION_DURATION - 240);
        await auction.connect(bidder1).bid(BID_AMOUNT);
        
        // Get the current end time after extension
        const extendedEndTime = await auction.endTime();
        
        // Another late bid - calculate time so it's in the last 5 minutes again
        const timeToIncrease = Number(extendedEndTime - BigInt(await time.latest())) - 120;
        await time.increase(timeToIncrease);
        await auction.connect(bidder2).bid(HIGHER_BID);
        
        // Get final end time
        const finalEndTime = await auction.endTime();
        
        // Move past final end time
        const timeUntilEnd = Number(finalEndTime - BigInt(await time.latest())) + 10;
        await time.increase(timeUntilEnd);
        
        // Verify auction is now over
        const currentTime = await time.latest();
        const endTime = await auction.endTime();
        console.log("Current time:", currentTime);
        console.log("End time:", endTime);
        console.log("Difference:", Number(BigInt(currentTime) - endTime));
        
        // Settlement should work
        await auction.withdraw();
        expect(await auction.settled()).to.equal(true);
        
        // Funds should go to beneficiary
        expect(await bidToken.balanceOf(beneficiary.address)).to.equal(HIGHER_BID);
    });

    it("Should allow anyone to trigger settlement", async function () {
      await auction.connect(bidder1).bid(BID_AMOUNT);
      await time.increase(AUCTION_DURATION + 1);
      
      // Non-participant calls withdraw
      await auction.connect(nonParticipant).withdraw();
      
      // Check settlement worked correctly
      expect(await auction.settled()).to.equal(true);
      expect(await bidToken.balanceOf(beneficiary.address)).to.equal(BID_AMOUNT);
    });
  });

  describe("Participation Points", function () {
    it("Should mint PP tokens on first bid", async function () {
      await auction.connect(bidder1).bid(BID_AMOUNT);
      expect(await rewardToken.balanceOf(bidder1.address)).to.equal(ethers.parseEther("1"));
    });

    it("Should mint PP tokens on each bid", async function () {
      // First bidder gets a token
      await auction.connect(bidder1).bid(BID_AMOUNT);
      expect(await rewardToken.balanceOf(bidder1.address)).to.equal(ethers.parseEther("1"));

      // Second bidder also gets a token
      await auction.connect(bidder2).bid(HIGHER_BID);
      expect(await rewardToken.balanceOf(bidder2.address)).to.equal(ethers.parseEther("1"));
      
      // First bidder gets another token for second bid
      await auction.connect(bidder1).bid(MUCH_HIGHER_BID);
      expect(await rewardToken.balanceOf(bidder1.address)).to.equal(ethers.parseEther("2"));
    });
  });

  describe("Edge Cases", function () {
    it("Should handle failed token transfers", async function () {
      try {
        // Deploy a malicious token that fails on transfer
        const MaliciousToken = await ethers.getContractFactory("MaliciousToken");
        const maliciousToken = await MaliciousToken.deploy();
        await maliciousToken.waitForDeployment();
        const maliciousTokenAddress = await maliciousToken.getAddress();
        console.log("Malicious token deployed at:", maliciousTokenAddress);
        
        // Deploy auction with malicious token
        const ChronoAuction = await ethers.getContractFactory("ChronoAuction");
        const badAuction = await ChronoAuction.deploy(
          maliciousTokenAddress,
          AUCTION_DURATION,
          await rewardToken.getAddress(),
          beneficiary.address
        );
        await badAuction.waitForDeployment();
        const badAuctionAddress = await badAuction.getAddress();
        console.log("Bad auction deployed at:", badAuctionAddress);
        
        // Allow auction to mint rewards
        await rewardToken.addAllowedAuction(badAuctionAddress);
        
        // Fund bidder
        await maliciousToken.mint(bidder1.address, BID_AMOUNT);
        await maliciousToken.connect(bidder1).approve(badAuctionAddress, BID_AMOUNT);
        
        // Verify we can make this call
        console.log("Testing bid with malicious token...");
        
        // Bid should fail on token transfer
        await expect(badAuction.connect(bidder1).bid(BID_AMOUNT))
          .to.be.revertedWith("Transfer failed");
        
        console.log("Test successful!");
      } catch (error) {
        console.error("Error in malicious token test:", error);
        throw error;
      }
    });
    
    it("Should handle auction with no activity", async function () {
      // Just advance time
      await time.increase(AUCTION_DURATION + 1);
      
      // Attempt to withdraw
      await expect(auction.withdraw())
        .to.be.revertedWith("No bids placed");
    });
  });
});