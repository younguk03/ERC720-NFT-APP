'use client'

import { useState, useEffect } from 'react'
import { ethers } from 'ethers'
import { connectWallet, getProvider, formatAddress } from '@/lib/web3'
import { getContract, getContractWithSigner } from '@/lib/contract'
import { contractAddress } from '@/lib/constants'
import { uploadMetadataToIPFS, getIPFSUrl, NFTMetadata } from '@/lib/ipfs'
import NFTCard from '@/components/NFTCard'
import ImageUpload from '@/components/ImageUpload'

export default function Home() {
  const [address, setAddress] = useState<string>('')
  const [isConnecting, setIsConnecting] = useState(false)
  const [contractInfo, setContractInfo] = useState<{
    name: string
    symbol: string
  } | null>(null)
  const [myNFTs, setMyNFTs] = useState<
    Array<{
      tokenId: string
      owner: string
      tokenURI: string
    }>
  >([])
  const [isLoading, setIsLoading] = useState(false)
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
      setContractInfo(null)
      setBalance(0n)
    } else {
      setAddress(accounts[0])
      loadData(accounts[0])
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
      ) as Array<{
        tokenId: string
        owner: string
        tokenURI: string
      }>

      setMyNFTs(nfts)
    } catch (error: any) {
      console.error('Load all NFTs error:', error)
      alert(error.message || 'NFT 조회에 실패했습니다.')
    } finally {
      setIsLoading(false)
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
    } catch (error: any) {
      console.error('Mint error:', error)
      alert(error.message || '민팅에 실패했습니다.')
    } finally {
      setIsMinting(false)
    }
  }

  const handleQueryToken = async () => {
    const tokenId = prompt('조회할 Token ID를 입력하세요:')
    if (!tokenId) return

    try {
      setIsLoading(true)
      const provider = getProvider()
      if (!provider) return

      const contract = getContract(provider)
      const [owner, tokenURI] = await Promise.all([
        contract.ownerOf(tokenId),
        contract.tokenURI(tokenId),
      ])

      const existingIndex = myNFTs.findIndex((nft) => nft.tokenId === tokenId)
      const nftData = { tokenId, owner, tokenURI }

      if (existingIndex >= 0) {
        setMyNFTs((prev) => {
          const updated = [...prev]
          updated[existingIndex] = nftData
          return updated
        })
      } else {
        setMyNFTs((prev) => [...prev, nftData])
      }
    } catch (error: any) {
      console.error('Query token error:', error)
      alert(error.message || '토큰 조회에 실패했습니다.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleRefresh = async () => {
    if (address) {
      await loadData(address)
    }
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
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-zinc-500 dark:text-zinc-500">
              이름, 학번:
            </span>
            <span className="text-sm font-mono text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 px-3 py-1 rounded">
              김영욱 92212788
            </span>
            <br />
            <span className="text-sm text-zinc-500 dark:text-zinc-500">
              owner 주소:
            </span>
            <span className="text-sm font-mono text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 px-3 py-1 rounded">
              김영욱 92212788
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

        {/* NFT 조회 및 관리 섹션 */}
        {address && (
          <div className="bg-white dark:bg-zinc-900 rounded-lg p-6 mb-6 border border-zinc-200 dark:border-zinc-800">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
                NFT 조회 및 관리
              </h2>
              <div className="flex gap-2">
                <button
                  onClick={loadAllMyNFTs}
                  disabled={isLoading}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors text-sm font-medium"
                >
                  내 NFT 모두 조회
                </button>
                <button
                  onClick={handleQueryToken}
                  disabled={isLoading}
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors text-sm font-medium"
                >
                  Token ID로 조회
                </button>
                <button
                  onClick={handleRefresh}
                  disabled={isLoading}
                  className="px-4 py-2 bg-zinc-600 text-white rounded-lg hover:bg-zinc-700 disabled:opacity-50 transition-colors text-sm font-medium"
                >
                  새로고침
                </button>
              </div>
            </div>

            {isLoading ? (
              <div className="text-center py-8 text-zinc-600 dark:text-zinc-400">
                로딩 중...
              </div>
            ) : myNFTs.length === 0 ? (
              <div className="text-center py-8 text-zinc-600 dark:text-zinc-400">
                조회된 NFT가 없습니다. Token ID로 조회해보세요.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {myNFTs.map((nft) => (
                  <NFTCard
                    key={nft.tokenId}
                    tokenId={nft.tokenId}
                    owner={nft.owner}
                    tokenURI={nft.tokenURI}
                    currentAddress={address}
                    onTransfer={handleRefresh}
                    onRefresh={handleRefresh}
                  />
                ))}
              </div>
            )}
          </div>
        )}

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
              • <strong>NFT 조회:</strong> "내 NFT 모두 조회" 버튼으로 소유한
              모든 NFT를 조회할 수 있습니다
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