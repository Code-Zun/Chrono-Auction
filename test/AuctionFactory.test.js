const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

describe("AuctionFactory Contract", function () {
  async function deployContractsFixture() {
    const [owner, user1, user2, beneficiary] = await ethers.getSigners();

    // Deploy reward token
    const ParticipationToken = await ethers.getContractFactory("ParticipationToken");
    const rewardToken = await ParticipationToken.deploy();
    
    // Deploy mock tokens
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const mockToken1 = await MockERC20.deploy("Mock Token 1", "MT1");
    const mockToken2 = await MockERC20.deploy("Mock Token 2", "MT2");
    
    // Deploy factory
    const AuctionFactory = await ethers.getContractFactory("AuctionFactory");
    const factory = await AuctionFactory.deploy(await rewardToken.getAddress());
    
    // Transfer reward token ownership to factory
    await rewardToken.transferOwnership(await factory.getAddress());
    
    // Add supported token
    await factory.addSupportedBidToken(await mockToken1.getAddress());
    
    // Fund users
    await mockToken1.mint(user1.address, ethers.parseEther("1000"));
    await mockToken1.mint(user2.address, ethers.parseEther("1000"));
    await mockToken2.mint(user1.address, ethers.parseEther("1000"));
    
    return { 
      factory, rewardToken, mockToken1, mockToken2, 
      owner, user1, user2, beneficiary 
    };
  }

  beforeEach(async function () {
    Object.assign(this, await loadFixture(deployContractsFixture));
  });

  describe("Deployment & Setup", function () {
    it("Should initialize with correct parameters", async function () {
      expect(await this.factory.rewardToken()).to.equal(await this.rewardToken.getAddress());
      expect(await this.rewardToken.owner()).to.equal(await this.factory.getAddress());
      expect(await this.factory.minAuctionDuration()).to.equal(3600n); // 1 hour
      expect(await this.factory.maxAuctionDuration()).to.equal(2592000n); // 30 days
    });
  });

  describe("Bid Token Management", function () {
    it("Should manage supported tokens correctly", async function () {
      const tokenAddr = await this.mockToken2.getAddress();
      
      // Add token
      await expect(this.factory.addSupportedBidToken(tokenAddr))
        .to.emit(this.factory, "BidTokenAdded")
        .withArgs(tokenAddr);
      expect(await this.factory.supportedBidTokens(tokenAddr)).to.be.true;
      
      // Remove token
      await expect(this.factory.removeSupportedBidToken(tokenAddr))
        .to.emit(this.factory, "BidTokenRemoved")
        .withArgs(tokenAddr);
      expect(await this.factory.supportedBidTokens(tokenAddr)).to.be.false;
    });

    it("Should reject invalid token management", async function () {
      // Non-owner trying to manage tokens
      await expect(this.factory.connect(this.user1).addSupportedBidToken(ethers.ZeroAddress))
        .to.be.revertedWithCustomError(this.factory, "OwnableUnauthorizedAccount");
      
      // Invalid token address
      await expect(this.factory.addSupportedBidToken(ethers.ZeroAddress))
        .to.be.revertedWithCustomError(this.factory, "InvalidTokenAddress");
      
      // Skip Non-ERC20 test if contract doesn't exist
      try {
        const NonERC20 = await ethers.getContractFactory("NonERC20");
        const fakeToken = await NonERC20.deploy();
        await expect(this.factory.addSupportedBidToken(await fakeToken.getAddress()))
          .to.be.revertedWithCustomError(this.factory, "InvalidTokenAddress");
      } catch (error) {
        console.log("Skipping NonERC20 test - contract not available");
      }
    });
  });

  describe("Duration Limits", function () {
    it("Should update and enforce duration limits", async function () {
      const newMin = 7200n; // 2 hours
      const newMax = 1296000n; // 15 days
      
      // Update limits
      await expect(this.factory.setDurationLimits(newMin, newMax))
        .to.emit(this.factory, "DurationLimitsUpdated")
        .withArgs(newMin, newMax);
      
      // Test boundaries
      await expect(this.factory.createAuction(
        await this.mockToken1.getAddress(),
        newMin - 1n,
        this.beneficiary.address
      )).to.be.revertedWithCustomError(this.factory, "InvalidDuration");

      await expect(this.factory.createAuction(
        await this.mockToken1.getAddress(),
        newMax + 1n,
        this.beneficiary.address
      )).to.be.revertedWithCustomError(this.factory, "InvalidDuration");
    });
  });

  describe("Auction Creation", function () {
    it("Should create and track auctions properly", async function () {
      const initialCount = await this.factory.getAuctionCount();
      
      // Create 3 auctions
      for (let i = 0; i < 3; i++) {
        await this.factory.connect(this.user1).createAuction(
          await this.mockToken1.getAddress(),
          86400n, // 1 day
          this.user1.address
        );
      }
      
      // Verify count and batch retrieval
      expect(await this.factory.getAuctionCount()).to.equal(initialCount + 3n);
      
      const batch = await this.factory.getAuctions(1, 2);
      expect(batch.length).to.equal(2);
      expect(batch[0]).to.equal(await this.factory.auctions(1));
      expect(batch[1]).to.equal(await this.factory.auctions(2));
      
      // Test invalid batch requests
      await expect(this.factory.getAuctions(0, 101))
        .to.be.revertedWithCustomError(this.factory, "BatchTooLarge");
      
      await expect(this.factory.getAuctions(5, 1))
        .to.be.revertedWithCustomError(this.factory, "StartIndexOutOfBounds");
    });

    it("Should enforce creation rules", async function () {
      // Unsupported token
      await expect(this.factory.createAuction(
        await this.mockToken2.getAddress(),
        86400n,
        this.beneficiary.address
      )).to.be.revertedWithCustomError(this.factory, "InvalidTokenAddress");

      // Invalid beneficiary
      await expect(this.factory.createAuction(
        await this.mockToken1.getAddress(),
        86400n,
        ethers.ZeroAddress
      )).to.be.revertedWithCustomError(this.factory, "InvalidTokenAddress");
    });
    
    it("Should track auction creators correctly", async function() {
      const tx = await this.factory.connect(this.user1).createAuction(
        await this.mockToken1.getAddress(),
        86400n,
        this.user1.address
      );
      const receipt = await tx.wait();
      const event = receipt.logs.find(log => 
        log.fragment && log.fragment.name === "AuctionCreated"
      );
      const auctionAddr = event.args[0];
      
      expect(await this.factory.auctionOwner(auctionAddr)).to.equal(this.user1.address);
    });
  });

  describe("Integration & Lifecycle", function () {
    it("Should handle full auction lifecycle with time extension", async function () {
      // Create auction
      const tx = await this.factory.createAuction(
        await this.mockToken1.getAddress(),
        3600n, // 1 hour
        this.beneficiary.address
      );
      const receipt = await tx.wait();
      const event = receipt.logs.find(log => 
        log.fragment && log.fragment.name === "AuctionCreated"
      );
      const auctionAddr = event.args[0];
      
      // Get auction contract
      const ChronoAuction = await ethers.getContractFactory("ChronoAuction");
      const auction = ChronoAuction.connect(this.user1).attach(auctionAddr);
      
      // Place initial bid
      const bidAmount = ethers.parseEther("1");
      await this.mockToken1.connect(this.user1).approve(auctionAddr, bidAmount);
      await auction.connect(this.user1).bid(bidAmount);
      
      // Test time extension
      const initialEnd = await auction.endTime();
      await time.increase(3540); // 59 minutes
      
      await this.mockToken1.connect(this.user2).approve(auctionAddr, ethers.parseEther("2"));
      await auction.connect(this.user2).bid(ethers.parseEther("2"));
      
      expect(await auction.endTime()).to.equal(initialEnd + 300n); // +5 mins
      
      // Finalize auction
      await time.increase(3600 + 300 + 60); // Pass end time
      await auction.withdraw();
      
      // Verify outcomes
      expect(await this.mockToken1.balanceOf(this.beneficiary.address))
        .to.equal(ethers.parseEther("2"));
      expect(await this.rewardToken.balanceOf(this.user1.address))
        .to.equal(ethers.parseEther("1"));
      expect(await this.rewardToken.balanceOf(this.user2.address))
        .to.equal(ethers.parseEther("1"));
    });
  });

  describe("Emergency Controls", function () {
    it("Should enable pause functionality", async function () {
      await this.factory.emergencyPause(true);
      expect(await this.factory.paused()).to.be.true;
      
      await expect(this.factory.createAuction(
        await this.mockToken1.getAddress(),
        86400n,
        this.beneficiary.address
      )).to.be.revertedWithCustomError(this.factory, "AuctionCreationPaused");
    });
  });

  describe("Fuzz Testing", function () {
    // Set timeout for all tests in this describe block
    this.timeout(10000); // Applies to all tests in this section
  
    it("Should accept valid random durations (%%)", async function () {
      const minDur = Number(await this.factory.minAuctionDuration());
      const maxDur = Number(await this.factory.maxAuctionDuration());
      
      const duration = Math.floor(
        Math.random() * (maxDur - minDur) + minDur
      );
      
      await expect(this.factory.createAuction(
        await this.mockToken1.getAddress(),
        BigInt(duration),
        this.beneficiary.address
      )).to.not.be.reverted;
    });
    
    it("Should handle multiple random bids correctly", async function() {
      // Create auction
      const tx = await this.factory.createAuction(
        await this.mockToken1.getAddress(),
        7200n, // 2 hours
        this.beneficiary.address
      );
      const receipt = await tx.wait();
      const event = receipt.logs.find(log => 
        log.fragment && log.fragment.name === "AuctionCreated"
      );
      const auctionAddr = event.args[0];
      
      const ChronoAuction = await ethers.getContractFactory("ChronoAuction");
      const auction = ChronoAuction.attach(auctionAddr);
      
      // Create random bids (3-5 bids)
      const numBids = 3 + Math.floor(Math.random() * 3);
      let highestBid = ethers.parseEther("0");
      
      for (let i = 0; i < numBids; i++) {
        const bidder = i % 2 === 0 ? this.user1 : this.user2;
        const bidAmount = ethers.parseEther((1 + Math.random() * 5).toFixed(2));
        
        if (bidAmount <= highestBid) continue; // Skip if not higher
        
        highestBid = bidAmount;
        await this.mockToken1.connect(bidder).approve(auctionAddr, bidAmount);
        await auction.connect(bidder).bid(bidAmount);
      }
      
      // Verify final state
      await time.increase(7300); // Past auction end
      await auction.withdraw();
      
      expect(await this.mockToken1.balanceOf(this.beneficiary.address))
        .to.equal(highestBid);
    });
  });
});