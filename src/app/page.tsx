'use client'

import { useState, useEffect, useMemo } from 'react'
import { ethers } from 'ethers'
import { connectWallet, getProvider, formatAddress } from '@/lib/web3'
import { getContract, getContractWithSigner } from '@/lib/contract'
import { contractAddress } from '@/lib/constants'
import { uploadMetadataToIPFS, getIPFSUrl, NFTMetadata } from '@/lib/ipfs'
import NFTCard from '@/components/NFTCard'
import ImageUpload from '@/components/ImageUpload'

type NFTInfo = {
  tokenId: string
  owner: string
  tokenURI: string
}

type DelegatedNFTInfo = NFTInfo & {
  approvalType: 'single' | 'all'
}

type QueryMode = 'my' | 'all' | 'approved' | 'token'

export default function Home() {
  const [address, setAddress] = useState<string>('')
  const [isConnecting, setIsConnecting] = useState(false)
  const [contractInfo, setContractInfo] = useState<{
    name: string
    symbol: string
  } | null>(null)
  const [myNFTs, setMyNFTs] = useState<NFTInfo[]>([])
  const [allNFTs, setAllNFTs] = useState<NFTInfo[]>([])
  const [approvedNFTs, setApprovedNFTs] = useState<DelegatedNFTInfo[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingAllNFTs, setIsLoadingAllNFTs] = useState(false)
  const [isLoadingApprovedNFTs, setIsLoadingApprovedNFTs] = useState(false)
  const [isLoadingTokenQuery, setIsLoadingTokenQuery] = useState(false)
  const [mintTokenURI, setMintTokenURI] = useState('')
  const [isMinting, setIsMinting] = useState(false)
  const [balance, setBalance] = useState<bigint>(0n)

  // 이미지 업로드 관련 상태
  const [imageHash, setImageHash] = useState<string | null>(null)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [nftName, setNftName] = useState('')
  const [nftDescription, setNftDescription] = useState('')
  const [mintMode, setMintMode] = useState<'image' | 'uri'>('image')
  const [isUploadingMetadata, setIsUploadingMetadata] = useState(false)
  const [delegateTargets, setDelegateTargets] = useState<
    Record<string, string>
  >({})
  const [delegateTransferTokenId, setDelegateTransferTokenId] = useState<
    string | null
  >(null)
  const approvalLookup = useMemo(() => {
    const map = new Map<string, DelegatedNFTInfo['approvalType']>()
    for (const nft of approvedNFTs) {
      map.set(nft.tokenId, nft.approvalType)
    }
    return map
  }, [approvedNFTs])
  const [activeQuery, setActiveQuery] = useState<QueryMode>('my')
  const [tokenIdInput, setTokenIdInput] = useState('')
  const [tokenQueryResults, setTokenQueryResults] = useState<NFTInfo[]>([])
  const [lastQueriedTokenId, setLastQueriedTokenId] = useState('')

  useEffect(() => {
    checkConnection()
    if (window.ethereum) {
      window.ethereum.on('accountsChanged', handleAccountsChanged)
      window.ethereum.on('chainChanged', () => window.location.reload())
    }
    return () => {
      if (window.ethereum) {
        window.ethereum.removeListener('accountsChanged', handleAccountsChanged)
      }
    }
  }, [])

  const handleAccountsChanged = (accounts: string[]) => {
    if (accounts.length === 0) {
      setAddress('')
      setMyNFTs([])
      setAllNFTs([])
      setApprovedNFTs([])
      setDelegateTargets({})
      setContractInfo(null)
      setBalance(0n)
    } else {
      setAddress(accounts[0])
      loadData(accounts[0])
      loadApprovedNFTs({ targetAddress: accounts[0], skipAlert: true })
    }
  }

  const checkConnection = async () => {
    const provider = getProvider()
    if (!provider) return

    try {
      const accounts = await provider.send('eth_accounts', [])
      if (accounts.length > 0) {
        setAddress(accounts[0])
        await loadData(accounts[0])
        await loadApprovedNFTs({ targetAddress: accounts[0], skipAlert: true })
      }
    } catch (error) {
      console.error('Connection check error:', error)
    }
  }

  const handleConnect = async () => {
    try {
      setIsConnecting(true)
      const { address: connectedAddress } = await connectWallet()
      setAddress(connectedAddress)
      await loadData(connectedAddress)
      await loadApprovedNFTs({
        targetAddress: connectedAddress,
        skipAlert: true,
      })
    } catch (error: any) {
      alert(error.message || '지갑 연결에 실패했습니다.')
    } finally {
      setIsConnecting(false)
    }
  }

  const loadData = async (userAddress: string) => {
    if (!userAddress) return

    setIsLoading(true)
    try {
      const provider = getProvider()
      if (!provider) return

      const contract = getContract(provider)

      // 컨트랙트 정보 조회
      const [name, symbol, balanceOf] = await Promise.all([
        contract.name(),
        contract.symbol(),
        contract.balanceOf(userAddress),
      ])

      setContractInfo({ name, symbol })
      setBalance(balanceOf)
    } catch (error: any) {
      console.error('Load data error:', error)
      alert(error.message || '데이터 로드에 실패했습니다.')
    } finally {
      setIsLoading(false)
    }
  }

  const loadAllMyNFTs = async () => {
    if (!address) {
      alert('먼저 지갑을 연결해주세요.')
      return
    }

    setIsLoading(true)
    try {
      const provider = getProvider()
      if (!provider) return

      const contract = getContract(provider)

      // Transfer 이벤트를 조회하여 사용자가 받은 모든 NFT 찾기
      const filter = contract.filters.Transfer(null, address)
      const events = await contract.queryFilter(filter)

      // 중복 제거를 위한 Set 사용
      const tokenIdSet = new Set<string>()

      // Transfer 이벤트에서 to가 사용자 주소인 경우만 수집
      for (const event of events) {
        if ('args' in event && event.args) {
          const args = event.args as any
          if (args.to && args.to.toLowerCase() === address.toLowerCase()) {
            tokenIdSet.add(args.tokenId.toString())
          }
        }
      }

      // 현재 소유하고 있는지 확인 (전송된 경우 제외)
      const nftPromises = Array.from(tokenIdSet).map(async (tokenId) => {
        try {
          const owner = await contract.ownerOf(tokenId)
          if (owner.toLowerCase() === address.toLowerCase()) {
            const tokenURI = await contract.tokenURI(tokenId).catch(() => '')
            return { tokenId, owner, tokenURI }
          }
          return null
        } catch {
          return null
        }
      })

      const nfts = (await Promise.all(nftPromises)).filter(
        (nft) => nft !== null
      ) as NFTInfo[]

      setMyNFTs(nfts)
    } catch (error: any) {
      console.error('Load all NFTs error:', error)
      alert(error.message || 'NFT 조회에 실패했습니다.')
    } finally {
      setIsLoading(false)
    }
  }

  const loadAllNFTs = async () => {
    setIsLoadingAllNFTs(true)
    try {
      const provider = getProvider()
      if (!provider) {
        alert('MetaMask를 설치하고 활성화한 뒤 다시 시도해주세요.')
        return
      }

      const contract = getContract(provider)
      const filter = contract.filters.Transfer(null, null)
      const events = await contract.queryFilter(filter)

      const tokenIdSet = new Set<string>()
      for (const event of events) {
        if ('args' in event && event.args?.tokenId) {
          tokenIdSet.add(event.args.tokenId.toString())
        }
      }

      const nftPromises = Array.from(tokenIdSet).map(async (tokenId) => {
        try {
          const [owner, tokenURI] = await Promise.all([
            contract.ownerOf(tokenId),
            contract.tokenURI(tokenId).catch(() => ''),
          ])
          return { tokenId, owner, tokenURI }
        } catch {
          return null
        }
      })

      const nfts = (await Promise.all(nftPromises)).filter(
        (nft): nft is NFTInfo => nft !== null
      )

      nfts.sort((a, b) => {
        const diff = BigInt(b.tokenId) - BigInt(a.tokenId)
        if (diff === 0n) return 0
        return diff > 0n ? 1 : -1
      })

      setAllNFTs(nfts)
    } catch (error: any) {
      console.error('Load all NFTs error:', error)
      alert(error.message || '전체 NFT 조회에 실패했습니다.')
    } finally {
      setIsLoadingAllNFTs(false)
    }
  }

  const loadApprovedNFTs = async ({
    targetAddress,
    skipAlert = false,
  }: {
    targetAddress?: string
    skipAlert?: boolean
  } = {}) => {
    const userAddress = targetAddress ?? address
    if (!userAddress) {
      if (!skipAlert) {
        alert('먼저 지갑을 연결해주세요.')
      }
      return
    }

    setIsLoadingApprovedNFTs(true)
    try {
      const provider = getProvider()
      if (!provider) {
        if (!skipAlert) {
          alert('MetaMask를 설치하고 활성화한 뒤 다시 시도해주세요.')
        }
        return
      }

      const contract = getContract(provider)
      const transferFilter = contract.filters.Transfer(null, null)
      const events = await contract.queryFilter(transferFilter)

      const tokenIdSet = new Set<string>()
      for (const event of events) {
        if ('args' in event && event.args?.tokenId) {
          tokenIdSet.add(event.args.tokenId.toString())
        }
      }

      const userAddressLower = userAddress.toLowerCase()
      const ownerApprovalCache = new Map<string, boolean>()

      const nftPromises = Array.from(tokenIdSet).map(async (tokenId) => {
        try {
          const [owner, tokenURI, approved] = await Promise.all([
            contract.ownerOf(tokenId),
            contract.tokenURI(tokenId).catch(() => ''),
            contract.getApproved(tokenId).catch(() => ethers.ZeroAddress),
          ])

          const ownerLower = owner.toLowerCase()
          if (approved && approved.toLowerCase() === userAddressLower) {
            return {
              tokenId,
              owner,
              tokenURI,
              approvalType: 'single' as const,
            }
          }

          let isOperator = ownerApprovalCache.get(ownerLower)
          if (isOperator === undefined) {
            try {
              isOperator = await contract.isApprovedForAll(owner, userAddress)
            } catch {
              isOperator = false
            }
            ownerApprovalCache.set(ownerLower, Boolean(isOperator))
          }

          if (isOperator) {
            return {
              tokenId,
              owner,
              tokenURI,
              approvalType: 'all' as const,
            }
          }

          return null
        } catch (error) {
          console.error('Delegate NFT fetch error:', error)
          return null
        }
      })

      const delegated = (await Promise.all(nftPromises)).filter(
        (nft): nft is DelegatedNFTInfo => nft !== null
      )

      delegated.sort((a, b) => {
        const diff = BigInt(b.tokenId) - BigInt(a.tokenId)
        if (diff === 0n) return 0
        return diff > 0n ? 1 : -1
      })

      setApprovedNFTs(delegated)
    } catch (error: any) {
      console.error('Load approved NFTs error:', error)
      alert(error.message || '승인된 NFT 조회에 실패했습니다.')
    } finally {
      setIsLoadingApprovedNFTs(false)
    }
  }

  const fetchTokenById = async (
    tokenId: string,
    { suppressAlerts = false }: { suppressAlerts?: boolean } = {}
  ) => {
    const normalizedTokenId = tokenId.trim()
    if (!normalizedTokenId) {
      if (!suppressAlerts) {
        alert('조회할 Token ID를 입력해주세요.')
      }
      return
    }

    try {
      setIsLoadingTokenQuery(true)
      const provider = getProvider()
      if (!provider) {
        if (!suppressAlerts) {
          alert('MetaMask를 설치하고 활성화한 뒤 다시 시도해주세요.')
        }
        return
      }

      const contract = getContract(provider)
      const [owner, tokenURI] = await Promise.all([
        contract.ownerOf(normalizedTokenId),
        contract.tokenURI(normalizedTokenId),
      ])

      setTokenQueryResults([{ tokenId: normalizedTokenId, owner, tokenURI }])
      setLastQueriedTokenId(normalizedTokenId)
    } catch (error: any) {
      console.error('Query token error:', error)
      if (!suppressAlerts) {
        alert(error.message || '토큰 조회에 실패했습니다.')
      }
    } finally {
      setIsLoadingTokenQuery(false)
    }
  }

  const handleQueryToken = async () => {
    await fetchTokenById(tokenIdInput, { suppressAlerts: false })
  }

  const handleSelectQuery = async (mode: QueryMode) => {
    setActiveQuery(mode)

    if ((mode === 'my' || mode === 'approved') && !address) {
      return
    }

    if (mode === 'my') {
      await loadAllMyNFTs()
    } else if (mode === 'all') {
      await loadAllNFTs()
    } else if (mode === 'approved') {
      await loadApprovedNFTs()
    }
  }

  const refreshActiveQuery = async () => {
    if (activeQuery === 'my') {
      if (address) {
        await loadAllMyNFTs()
      }
    } else if (activeQuery === 'all') {
      await loadAllNFTs()
    } else if (activeQuery === 'approved') {
      if (address) {
        await loadApprovedNFTs({ skipAlert: true })
      }
    } else if (activeQuery === 'token' && lastQueriedTokenId) {
      await fetchTokenById(lastQueriedTokenId, { suppressAlerts: true })
    }
  }

  const handleImageUploaded = (hash: string, url: string) => {
    setImageHash(hash)
    setImageUrl(url)
  }

  const handleMintWithImage = async () => {
    if (!address) {
      alert('먼저 지갑을 연결해주세요.')
      return
    }

    if (!imageHash) {
      alert('먼저 이미지를 IPFS에 업로드해주세요.')
      return
    }

    if (!nftName.trim()) {
      alert('NFT 이름을 입력해주세요.')
      return
    }

    try {
      setIsUploadingMetadata(true)

      // 메타데이터 생성
      const metadata: NFTMetadata = {
        name: nftName,
        description: nftDescription || `${nftName} NFT`,
        image: getIPFSUrl(imageHash),
      }

      // 메타데이터를 IPFS에 업로드
      const metadataHash = await uploadMetadataToIPFS(metadata)
      const metadataURI = getIPFSUrl(metadataHash)

      setIsUploadingMetadata(false)
      setIsMinting(true)

      // NFT 민팅
      const provider = new ethers.BrowserProvider(window.ethereum)
      const signer = await provider.getSigner()
      const contract = getContractWithSigner(signer)

      const tx = await contract.safeMint(address, metadataURI)
      await tx.wait()
      alert('민팅이 완료되었습니다!')

      // 상태 초기화
      setImageHash(null)
      setImageUrl(null)
      setNftName('')
      setNftDescription('')
      await loadData(address)
      await loadAllNFTs()
    } catch (error: any) {
      console.error('Mint error:', error)
      alert(error.message || '민팅에 실패했습니다.')
    } finally {
      setIsUploadingMetadata(false)
      setIsMinting(false)
    }
  }

  const handleMintWithURI = async () => {
    if (!address) {
      alert('먼저 지갑을 연결해주세요.')
      return
    }

    if (!mintTokenURI.trim()) {
      alert('Token URI를 입력해주세요.')
      return
    }

    try {
      setIsMinting(true)
      const provider = new ethers.BrowserProvider(window.ethereum)
      const signer = await provider.getSigner()
      const contract = getContractWithSigner(signer)

      const tx = await contract.safeMint(address, mintTokenURI)
      await tx.wait()
      alert('민팅이 완료되었습니다!')
      setMintTokenURI('')
      await loadData(address)
      await loadAllNFTs()
    } catch (error: any) {
      console.error('Mint error:', error)
      alert(error.message || '민팅에 실패했습니다.')
    } finally {
      setIsMinting(false)
    }
  }

  const handleRefresh = async () => {
    if (address) {
      await loadData(address)
      await loadApprovedNFTs({ skipAlert: true })
    }
    await refreshActiveQuery()
  }

  const handleDelegateInputChange = (tokenId: string, value: string) => {
    setDelegateTargets((prev) => ({
      ...prev,
      [tokenId]: value,
    }))
  }

  const handleDelegateTransfer = async (nft: DelegatedNFTInfo) => {
    if (!address) {
      alert('먼저 지갑을 연결해주세요.')
      return
    }

    if (typeof window === 'undefined' || !window.ethereum) {
      alert('MetaMask를 설치하고 활성화한 뒤 다시 시도해주세요.')
      return
    }

    const to = (delegateTargets[nft.tokenId] || '').trim()
    if (!to) {
      alert('전송 받을 주소를 입력해주세요.')
      return
    }

    if (!ethers.isAddress(to)) {
      alert('유효한 이더리움 주소를 입력해주세요.')
      return
    }

    try {
      setDelegateTransferTokenId(nft.tokenId)
      const provider = new ethers.BrowserProvider(window.ethereum)
      const signer = await provider.getSigner()
      const contract = getContractWithSigner(signer)

      const tx = await contract.safeTransferFrom(nft.owner, to, nft.tokenId)
      await tx.wait()
      alert('대리전송이 완료되었습니다!')
      setDelegateTargets((prev) => ({
        ...prev,
        [nft.tokenId]: '',
      }))
      await loadApprovedNFTs({ skipAlert: true })
      await loadAllNFTs()
    } catch (error: any) {
      console.error('Delegate transfer error:', error)
      alert(error.message || '대리전송에 실패했습니다.')
    } finally {
      setDelegateTransferTokenId(null)
    }
  }

  const renderBadges = (nft: NFTInfo) => {
    const badges: Array<{ label: string; style: string }> = []
    if (address && nft.owner.toLowerCase() === address.toLowerCase()) {
      badges.push({
        label: '내 소유',
        style: 'bg-indigo-600 text-white dark:bg-indigo-500 dark:text-white',
      })
    }

    const approvalType = approvalLookup.get(nft.tokenId)
    if (approvalType) {
      badges.push({
        label: approvalType === 'all' ? '전체 승인' : '토큰 승인',
        style: 'bg-amber-500 text-white dark:bg-amber-400 dark:text-zinc-900',
      })
    }

    if (badges.length === 0) return null

    return (
      <div className="absolute top-2 left-2 flex flex-wrap gap-2">
        {badges.map((badge) => (
          <span
            key={`${nft.tokenId}-${badge.label}`}
            className={`px-2 py-1 text-xs font-semibold rounded-full shadow-sm ${badge.style}`}
          >
            {badge.label}
          </span>
        ))}
      </div>
    )
  }

  const renderQueryResults = () => {
    if (activeQuery === 'my') {
      if (!address) {
        return (
          <div className="text-center py-8 text-zinc-600 dark:text-zinc-400">
            지갑을 연결하면 보유 중인 NFT를 조회할 수 있습니다.
          </div>
        )
      }

      if (isLoading) {
        return (
          <div className="text-center py-8 text-zinc-600 dark:text-zinc-400">
            내 NFT 데이터를 불러오는 중입니다...
          </div>
        )
      }

      if (myNFTs.length === 0) {
        return (
          <div className="text-center py-8 text-zinc-600 dark:text-zinc-400">
            조회된 NFT가 없습니다. 민팅하거나 Token ID로 조회해보세요.
          </div>
        )
      }

      return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {myNFTs.map((nft) => (
            <div key={`my-${nft.tokenId}`} className="relative">
              {renderBadges(nft)}
              <NFTCard
                tokenId={nft.tokenId}
                owner={nft.owner}
                tokenURI={nft.tokenURI}
                currentAddress={address || ''}
                onTransfer={handleRefresh}
                onRefresh={handleRefresh}
              />
            </div>
          ))}
        </div>
      )
    }

    if (activeQuery === 'all') {
      if (isLoadingAllNFTs) {
        return (
          <div className="text-center py-8 text-zinc-600 dark:text-zinc-400">
            전체 NFT 데이터를 불러오는 중입니다...
          </div>
        )
      }

      if (allNFTs.length === 0) {
        return (
          <div className="text-center py-8 text-zinc-600 dark:text-zinc-400">
            아직 조회된 NFT가 없습니다. 버튼을 눌러 최신 데이터를 가져오세요.
          </div>
        )
      }

      return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {allNFTs.map((nft) => (
            <div key={`all-${nft.tokenId}`} className="relative">
              {renderBadges(nft)}
              <NFTCard
                tokenId={nft.tokenId}
                owner={nft.owner}
                tokenURI={nft.tokenURI}
                currentAddress={address || ''}
                onTransfer={handleRefresh}
                onRefresh={handleRefresh}
              />
            </div>
          ))}
        </div>
      )
    }

    if (activeQuery === 'approved') {
      if (!address) {
        return (
          <div className="text-center py-8 text-zinc-600 dark:text-zinc-400">
            승인을 받으려면 먼저 지갑을 연결해주세요.
          </div>
        )
      }

      if (isLoadingApprovedNFTs) {
        return (
          <div className="text-center py-8 text-zinc-600 dark:text-zinc-400">
            승인된 NFT 정보를 불러오는 중입니다...
          </div>
        )
      }

      if (approvedNFTs.length === 0) {
        return (
          <div className="text-center py-8 text-zinc-600 dark:text-zinc-400">
            현재 대리전송이 가능한 NFT가 없습니다. 소유자로부터 승인을 받은 뒤
            다시 조회하세요.
          </div>
        )
      }

      return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {approvedNFTs.map((nft) => (
            <div
              key={`approved-${nft.tokenId}`}
              className="border rounded-lg p-4 bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800"
            >
              <div className="mb-3 space-y-1">
                <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                  Token ID: {nft.tokenId}
                </p>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  소유자: {formatAddress(nft.owner)}
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-500 break-all">
                  URI:{' '}
                  {nft.tokenURI.length > 60
                    ? `${nft.tokenURI.slice(0, 60)}...`
                    : nft.tokenURI}
                </p>
                <span
                  className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded ${
                    nft.approvalType === 'single'
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200'
                      : 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200'
                  }`}
                >
                  {nft.approvalType === 'single'
                    ? '단일 토큰 승인'
                    : '전체 소유자 승인'}
                </span>
              </div>
              <div className="space-y-2">
                <input
                  type="text"
                  value={delegateTargets[nft.tokenId] || ''}
                  onChange={(e) =>
                    handleDelegateInputChange(nft.tokenId, e.target.value)
                  }
                  placeholder="전송 받을 주소 입력"
                  className="w-full px-3 py-2 text-sm border rounded dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-50"
                />
                <button
                  onClick={() => handleDelegateTransfer(nft)}
                  disabled={delegateTransferTokenId === nft.tokenId}
                  className="w-full px-4 py-2 text-sm bg-amber-600 text-white rounded hover:bg-amber-700 disabled:opacity-50 transition-colors"
                >
                  {delegateTransferTokenId === nft.tokenId
                    ? '대리전송 중...'
                    : '대리전송 실행'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )
    }

    // token query
    if (isLoadingTokenQuery) {
      return (
        <div className="text-center py-8 text-zinc-600 dark:text-zinc-400">
          Token ID를 통해 NFT를 조회하는 중입니다...
        </div>
      )
    }

    if (tokenQueryResults.length === 0) {
      return (
        <div className="text-center py-8 text-zinc-600 dark:text-zinc-400">
          조회할 Token ID를 입력하고 조회 버튼을 눌러주세요.
        </div>
      )
    }

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {tokenQueryResults.map((nft) => (
          <div key={`token-${nft.tokenId}`} className="relative">
            {renderBadges(nft)}
            <NFTCard
              tokenId={nft.tokenId}
              owner={nft.owner}
              tokenURI={nft.tokenURI}
              currentAddress={address || ''}
              onTransfer={handleRefresh}
              onRefresh={handleRefresh}
            />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black py-8 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-zinc-900 dark:text-zinc-50 mb-2">
            ERC-721 NFT 테스트 앱
          </h1>
          <p className="text-zinc-600 dark:text-zinc-400 mb-4">
            Sepolia 테스트넷에서 NFT를 민팅하고 관리하세요
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-zinc-500 dark:text-zinc-500">
              컨트랙트 주소:
            </span>
            <span className="text-sm font-mono text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 px-3 py-1 rounded">
              {contractAddress}
            </span>
            <a
              href={`https://sepolia.etherscan.io/address/${contractAddress}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 underline"
            >
              Etherscan에서 보기
            </a>
          </div>
          <div className='mt-2'>
            <span className="text-sm text-zinc-500 dark:text-zinc-500">
              owner 주소:
            </span>
            <span className="text-sm font-mono text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 px-3 py-1 rounded">
              0x9f19f2781e0d66a75ec260c4bf44ac2ab0faabf8
            </span>
          </div>
          <div className='mt-2'>
            <span className="text-sm text-zinc-500 dark:text-zinc-500">
              이름, 학번:
            </span>
            <span className="text-sm font-mono text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 px-3 py-1 rounded">
              김영욱, 92212788
            </span>
          </div>
        </div>

        {/* 지갑 연결 섹션 */}
        <div className="bg-white dark:bg-zinc-900 rounded-lg p-6 mb-6 border border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
              지갑 연결
            </h2>
            {address && (
              <span className="text-sm text-zinc-600 dark:text-zinc-400">
                {formatAddress(address)}
              </span>
            )}
          </div>
          {!address ? (
            <button
              onClick={handleConnect}
              disabled={isConnecting}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors font-medium"
            >
              {isConnecting ? '연결 중...' : 'MetaMask 연결'}
            </button>
          ) : (
            <div className="space-y-4">
              <div className="text-sm text-zinc-600 dark:text-zinc-400">
                연결된 주소: <span className="font-mono">{address}</span>
              </div>
              <div className="text-sm text-zinc-600 dark:text-zinc-400">
                보유 NFT 수: {balance.toString()}
              </div>
              {contractInfo && (
                <div className="text-sm text-zinc-600 dark:text-zinc-400">
                  컨트랙트: {contractInfo.name} ({contractInfo.symbol})
                </div>
              )}
            </div>
          )}
        </div>

        {/* 민팅 섹션 */}
        {address && (
          <div className="bg-white dark:bg-zinc-900 rounded-lg p-6 mb-6 border border-zinc-200 dark:border-zinc-800">
            <h2 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50 mb-4">
              NFT 민팅
            </h2>

            {/* 민팅 모드 선택 */}
            <div className="mb-6 flex gap-4 border-b border-zinc-200 dark:border-zinc-700 pb-4">
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault()
                  console.log('이미지 업로드 방식 버튼 클릭')
                  setMintMode('image')
                }}
                className={`px-4 py-2 rounded-lg font-medium transition-colors cursor-pointer ${
                  mintMode === 'image'
                    ? 'bg-blue-600 text-white'
                    : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-300 dark:hover:bg-zinc-600'
                }`}
              >
                이미지 업로드 방식
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault()
                  console.log('URI 직접 입력 버튼 클릭')
                  setMintMode('uri')
                }}
                className={`px-4 py-2 rounded-lg font-medium transition-colors cursor-pointer ${
                  mintMode === 'uri'
                    ? 'bg-blue-600 text-white'
                    : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-300 dark:hover:bg-zinc-600'
                }`}
              >
                URI 직접 입력
              </button>
            </div>

            {mintMode === 'image' ? (
              <div className="space-y-4">
                {!process.env.NEXT_PUBLIC_PINATA_JWT ||
                process.env.NEXT_PUBLIC_PINATA_JWT ===
                  'your_pinata_jwt_token_here' ? (
                  <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
                    <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200 mb-2">
                      ⚠️ Pinata JWT가 설정되지 않았습니다
                    </p>
                    <p className="text-xs text-yellow-700 dark:text-yellow-300 mb-2">
                      이미지 업로드를 사용하려면 .env.local 파일에
                      NEXT_PUBLIC_PINATA_JWT를 설정해야 합니다.
                    </p>
                    <p className="text-xs text-yellow-700 dark:text-yellow-300">
                      자세한 설정 방법은 IPFS_SETUP.md 파일을 참고하세요.
                    </p>
                  </div>
                ) : null}
                <ImageUpload
                  onImageUploaded={handleImageUploaded}
                  disabled={isMinting || isUploadingMetadata}
                />

                {imageHash && (
                  <div className="space-y-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                    <div>
                      <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                        NFT 이름 <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={nftName}
                        onChange={(e) => setNftName(e.target.value)}
                        placeholder="예: My Awesome NFT"
                        className="w-full px-4 py-2 border rounded-lg dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-50"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                        NFT 설명
                      </label>
                      <textarea
                        value={nftDescription}
                        onChange={(e) => setNftDescription(e.target.value)}
                        placeholder="NFT에 대한 설명을 입력하세요"
                        rows={3}
                        className="w-full px-4 py-2 border rounded-lg dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-50"
                      />
                    </div>
                    <button
                      onClick={handleMintWithImage}
                      disabled={
                        isMinting || isUploadingMetadata || !nftName.trim()
                      }
                      className="w-full px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors font-medium"
                    >
                      {isUploadingMetadata
                        ? '메타데이터 업로드 중...'
                        : isMinting
                        ? '민팅 중...'
                        : 'NFT 민팅하기'}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                    Token URI
                  </label>
                  <input
                    type="text"
                    value={mintTokenURI}
                    onChange={(e) => setMintTokenURI(e.target.value)}
                    placeholder="예: ipfs://QmXXX... 또는 https://example.com/metadata/1.json"
                    className="w-full px-4 py-2 border rounded-lg dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-50"
                  />
                  <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                    IPFS URI (ipfs://) 또는 HTTP URL을 입력하세요
                  </p>
                </div>
                <button
                  onClick={handleMintWithURI}
                  disabled={isMinting}
                  className="w-full px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors font-medium"
                >
                  {isMinting ? '민팅 중...' : 'NFT 민팅'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* 조회 메뉴 */}
        <div className="bg-white dark:bg-zinc-900 rounded-lg p-6 mb-6 border border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
            <div>
              <h2 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
                NFT 조회 & 대리전송
              </h2>
              <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
                원하는 조회 메뉴를 선택하면 아래에 바로 결과가 표시됩니다.
              </p>
            </div>
            <button
              onClick={handleRefresh}
              className="px-4 py-2 text-sm font-medium bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
            >
              전체 새로고침
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            {(
              [
                { key: 'my', label: '내 NFT 조회' },
                { key: 'all', label: '전체 NFT 조회' },
                { key: 'approved', label: '승인된 NFT 조회' },
                { key: 'token', label: 'Token ID로 조회' },
              ] as Array<{ key: QueryMode; label: string }>
            ).map((button) => {
              const isActive = activeQuery === button.key
              const isBusy =
                (button.key === 'my' && isLoading) ||
                (button.key === 'all' && isLoadingAllNFTs) ||
                (button.key === 'approved' && isLoadingApprovedNFTs) ||
                (button.key === 'token' && isLoadingTokenQuery)

              const requiresWallet =
                (button.key === 'my' || button.key === 'approved') && !address

              return (
                <button
                  key={button.key}
                  onClick={() => handleSelectQuery(button.key)}
                  disabled={isBusy}
                  title={
                    requiresWallet
                      ? '지갑을 연결하면 이 메뉴를 사용할 수 있습니다.'
                      : undefined
                  }
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${
                    isActive
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 border-transparent hover:bg-zinc-200 dark:hover:bg-zinc-700'
                  } ${requiresWallet ? 'opacity-60 cursor-not-allowed' : ''}`}
                >
                  {isBusy ? '조회 중...' : button.label}
                </button>
              )
            })}
          </div>

          {activeQuery === 'token' && (
            <div className="mt-4 flex flex-col md:flex-row gap-2">
              <input
                type="text"
                value={tokenIdInput}
                onChange={(e) => setTokenIdInput(e.target.value)}
                placeholder="조회할 Token ID를 입력하세요"
                className="flex-1 px-4 py-2 border rounded-lg dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-50"
              />
              <button
                onClick={handleQueryToken}
                disabled={isLoadingTokenQuery}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors text-sm font-medium"
              >
                {isLoadingTokenQuery ? '조회 중...' : 'Token 조회'}
              </button>
            </div>
          )}

          <div className="mt-6">{renderQueryResults()}</div>
        </div>

        {/* 안내 섹션 */}
        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-6 border border-blue-200 dark:border-blue-800">
          <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-100 mb-2">
            사용 안내
          </h3>
          <ul className="space-y-2 text-sm text-blue-800 dark:text-blue-200">
            <li>
              • <strong>IPFS 설정:</strong> Pinata에서 JWT 토큰을 발급받아
              .env.local에 설정하세요
            </li>
            <li>
              • <strong>지갑 연결:</strong> MetaMask를 설치하고 Sepolia
              테스트넷으로 전환하세요
            </li>
            <li>
              • <strong>이미지 업로드:</strong> "이미지 업로드 방식"으로 사진을
              IPFS에 업로드하고 NFT로 민팅하세요
            </li>
            <li>
              • <strong>NFT 조회:</strong> 조회 메뉴에서 '내 NFT 조회' 또는
              '전체 NFT 조회'를 선택해 보유/전체 NFT를 확인하세요
            </li>
            <li>
              • <strong>Token 검색:</strong> 'Token ID로 조회' 메뉴에서 조회할
              Token ID를 입력하고 결과를 확인하세요
            </li>
            <li>
              • <strong>승인 대리전송:</strong> 소유자가 승인한 NFT는 "승인 NFT
              조회" 메뉴에서 확인 후 원하는 주소로 대리전송할 수 있습니다
            </li>
            <li>
              • <strong>NFT 관리:</strong> 소유한 NFT는 전송 및 승인 기능을
              사용할 수 있습니다
            </li>
            <li>
              • <strong>가스비:</strong> Sepolia 테스트넷 ETH가 필요합니다
            </li>
            <li>• 자세한 설정 방법은 IPFS_SETUP.md 파일을 참고하세요</li>
          </ul>
        </div>
      </div>
    </div>
  )
}