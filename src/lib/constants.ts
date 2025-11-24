export const contractAddress = '0x141229BfA1c090AE58Ac9EE8C50A2E7f9a88195A'

export const SEPOLIA_CHAIN_ID = 11155111

export const SEPOLIA_NETWORK = {
  chainId: `0x${SEPOLIA_CHAIN_ID.toString(16)}`,
  chainName: 'Sepolia',
  nativeCurrency: {
    name: 'Ether',
    symbol: 'ETH',
    decimals: 18,
  },
  rpcUrls: ['https://sepolia.infura.io/v3/'],
  blockExplorerUrls: ['https://sepolia.etherscan.io/'],
}