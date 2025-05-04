# Chrono Auction

A blockchain-based auction system with an innovative time-extension bidding mechanism.

## Features

- Time-extended bidding: Auction time extends when bids are placed near closing time
- ERC20 token bidding support
- Participation token rewards for bidders
- Factory pattern for easy auction creation

## Contracts

- `ChronoAuction.sol`: Main auction contract with time extension
- `ParticipationToken.sol`: ERC20 rewards for auction participation
- `AuctionFactory.sol`: Factory for creating and managing auctions

## Development
- npm install
- npx hardhat compile
- npx hardhat test

## License
MIT
EOL
