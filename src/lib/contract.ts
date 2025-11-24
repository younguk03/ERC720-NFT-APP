import { ethers } from 'ethers'
import { contractAddress } from './constants'
import abi from './abi.json'

export const getContract = (provider: ethers.Provider) => {
  return new ethers.Contract(contractAddress, abi, provider)
}

export const getContractWithSigner = (signer: ethers.Signer) => {
  return new ethers.Contract(contractAddress, abi, signer)
}
