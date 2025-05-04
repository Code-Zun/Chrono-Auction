const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ParticipationToken", function () {
  let token;
  let owner;
  let auction1;
  let auction2;
  let bidder;

  beforeEach(async function () {
    [owner, auction1, auction2, bidder] = await ethers.getSigners();
    
    // Deploy the token
    const ParticipationToken = await ethers.getContractFactory("ParticipationToken");
    token = await ParticipationToken.deploy();
  });

  it("Should have correct name and symbol", async function () {
    expect(await token.name()).to.equal("Participation Points");
    expect(await token.symbol()).to.equal("PP");
  });

  it("Should set the deployer as owner", async function () {
    expect(await token.owner()).to.equal(owner.address);
  });

  it("Should allow owner to add allowed auctions", async function () {
    await token.addAllowedAuction(auction1.address);
    expect(await token.allowedAuctions(auction1.address)).to.equal(true);
    expect(await token.allowedAuctions(auction2.address)).to.equal(false);
  });

  it("Should only allow whitelisted auctions to mint tokens", async function () {
    // Add auction1 to allowed auctions
    await token.addAllowedAuction(auction1.address);
    
    // Try minting from auction1 (should succeed)
    await token.connect(auction1).mint(bidder.address);
    
    // For ethers v6, parseUnits is directly on ethers, not ethers.utils
    const oneToken = ethers.parseUnits("1", 18);
    expect(await token.balanceOf(bidder.address)).to.equal(oneToken);
    
    // Try minting from auction2 (should fail)
    await expect(
      token.connect(auction2).mint(bidder.address)
    ).to.be.revertedWith("Only approved auctions");
  });

  it("Should not allow non-owners to add auctions", async function () {
    await expect(
      token.connect(bidder).addAllowedAuction(auction1.address)
    ).to.be.reverted;
  });
});