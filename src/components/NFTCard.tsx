'use client'

import { useState, useEffect } from 'react'
import { ethers } from 'ethers'
import { getContractWithSigner, getContract } from '@/lib/contract'
import { formatAddress } from '@/lib/web3'
import { getIPFSGatewayUrl } from '@/lib/ipfs'

interface NFTCardProps {
  tokenId: string
  owner: string
  tokenURI: string
  currentAddress: string
  onTransfer: () => void
  onRefresh: () => void
}

interface NFTMetadata {
  name?: string
  description?: string
  image?: string
  attributes?: Array<{
    trait_type: string
    value: string | number
  }>
}

export default function NFTCard({
  tokenId,
  owner,
  tokenURI,
  currentAddress,
  onTransfer,
  onRefresh,
}: NFTCardProps) {
  const [isApproving, setIsApproving] = useState(false)
  const [isTransferring, setIsTransferring] = useState(false)
  const [transferTo, setTransferTo] = useState('')
  const [approveTo, setApproveTo] = useState('')
  const [showTransfer, setShowTransfer] = useState(false)
  const [showApprove, setShowApprove] = useState(false)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [metadata, setMetadata] = useState<NFTMetadata | null>(null)
  const [isLoadingMetadata, setIsLoadingMetadata] = useState(false)

  const isOwner = owner.toLowerCase() === currentAddress.toLowerCase()

  // IPFS URL을 HTTP 게이트웨이 URL로 변환
  const convertIPFSUrl = (url: string): string => {
    if (url.startsWith('ipfs://')) {
      const hash = url.replace('ipfs://', '')
      return getIPFSGatewayUrl(hash)
    }
    if (url.startsWith('https://ipfs.io/ipfs/')) {
      const hash = url.replace('https://ipfs.io/ipfs/', '')
      return getIPFSGatewayUrl(hash)
    }
    return url
  }

  // 메타데이터 로드
  useEffect(() => {
    const loadMetadata = async () => {
      if (!tokenURI) return

      try {
        setIsLoadingMetadata(true)
        let metadataUrl = tokenURI

        // IPFS URL인 경우 게이트웨이 URL로 변환
        if (tokenURI.startsWith('ipfs://')) {
          const hash = tokenURI.replace('ipfs://', '')
          metadataUrl = getIPFSGatewayUrl(hash)
        }

        const response = await fetch(metadataUrl)
        if (!response.ok) {
          throw new Error('메타데이터를 가져올 수 없습니다.')
        }

        const data: NFTMetadata = await response.json()
        setMetadata(data)

        // 이미지 URL 처리
        if (data.image) {
          const imageUrl = convertIPFSUrl(data.image)
          setImageUrl(imageUrl)
        }
      } catch (error) {
        console.error('메타데이터 로드 오류:', error)
        setImageUrl(null)
        setMetadata(null)
      } finally {
        setIsLoadingMetadata(false)
      }
    }

    loadMetadata()
  }, [tokenURI])

  const handleApprove = async () => {
    if (!approveTo || !ethers.isAddress(approveTo)) {
      alert('유효한 주소를 입력해주세요.')
      return
    }

    try {
      setIsApproving(true)
      const provider = new ethers.BrowserProvider(window.ethereum)
      const signer = await provider.getSigner()
      const contract = getContractWithSigner(signer)

      const tx = await contract.approve(approveTo, tokenId)
      await tx.wait()
      alert('승인이 완료되었습니다!')
      setApproveTo('')
      setShowApprove(false)
      onRefresh()
    } catch (error: any) {
      console.error('Approve error:', error)
      alert(error.message || '승인에 실패했습니다.')
    } finally {
      setIsApproving(false)
    }
  }

  const handleTransfer = async () => {
    if (!transferTo || !ethers.isAddress(transferTo)) {
      alert('유효한 주소를 입력해주세요.')
      return
    }

    try {
      setIsTransferring(true)
      const provider = new ethers.BrowserProvider(window.ethereum)
      const signer = await provider.getSigner()
      const contract = getContractWithSigner(signer)

      const tx = await contract.safeTransferFrom(currentAddress, transferTo, tokenId)
      await tx.wait()
      alert('전송이 완료되었습니다!')
      setTransferTo('')
      setShowTransfer(false)
      onTransfer()
    } catch (error: any) {
      console.error('Transfer error:', error)
      alert(error.message || '전송에 실패했습니다.')
    } finally {
      setIsTransferring(false)
    }
  }

  return (
    <div className="border rounded-lg p-4 bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800">
      {/* 이미지 표시 */}
      {isLoadingMetadata ? (
        <div className="w-full h-48 bg-zinc-100 dark:bg-zinc-800 rounded-lg mb-3 flex items-center justify-center">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">로딩 중...</p>
        </div>
      ) : imageUrl ? (
        <div className="w-full mb-3 rounded-lg overflow-hidden">
          <img
            src={imageUrl}
            alt={metadata?.name || `NFT #${tokenId}`}
            className="w-full h-48 object-cover"
            onError={(e) => {
              console.error('이미지 로드 실패:', imageUrl)
              e.currentTarget.style.display = 'none'
            }}
          />
        </div>
      ) : (
        <div className="w-full h-48 bg-zinc-100 dark:bg-zinc-800 rounded-lg mb-3 flex items-center justify-center">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">이미지 없음</p>
        </div>
      )}

      <div className="mb-3">
        <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          {metadata?.name || `Token ID: ${tokenId}`}
        </h3>
        {metadata?.description && (
          <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1 line-clamp-2">
            {metadata.description}
          </p>
        )}
        <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
          소유자: {formatAddress(owner)}
        </p>
        {tokenURI && (
          <p className="text-xs text-zinc-500 dark:text-zinc-500 mt-1 break-all">
            URI: {tokenURI.length > 50 ? `${tokenURI.slice(0, 50)}...` : tokenURI}
          </p>
        )}
      </div>

      {isOwner && (
        <div className="space-y-2">
          {!showTransfer && !showApprove && (
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setShowTransfer(true)
                  setShowApprove(false)
                }}
                className="flex-1 px-3 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
              >
                전송
              </button>
              <button
                onClick={() => {
                  setShowApprove(true)
                  setShowTransfer(false)
                }}
                className="flex-1 px-3 py-2 text-sm bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
              >
                승인
              </button>
            </div>
          )}

          {showTransfer && (
            <div className="space-y-2">
              <input
                type="text"
                value={transferTo}
                onChange={(e) => setTransferTo(e.target.value)}
                placeholder="받을 주소 입력"
                className="w-full px-3 py-2 text-sm border rounded dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-50"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleTransfer}
                  disabled={isTransferring}
                  className="flex-1 px-3 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {isTransferring ? '전송 중...' : '전송하기'}
                </button>
                <button
                  onClick={() => {
                    setShowTransfer(false)
                    setTransferTo('')
                  }}
                  className="px-3 py-2 text-sm bg-zinc-300 dark:bg-zinc-700 text-zinc-900 dark:text-zinc-50 rounded hover:bg-zinc-400 dark:hover:bg-zinc-600 transition-colors"
                >
                  취소
                </button>
              </div>
            </div>
          )}

          {showApprove && (
            <div className="space-y-2">
              <input
                type="text"
                value={approveTo}
                onChange={(e) => setApproveTo(e.target.value)}
                placeholder="승인할 주소 입력"
                className="w-full px-3 py-2 text-sm border rounded dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-50"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleApprove}
                  disabled={isApproving}
                  className="flex-1 px-3 py-2 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 transition-colors"
                >
                  {isApproving ? '승인 중...' : '승인하기'}
                </button>
                <button
                  onClick={() => {
                    setShowApprove(false)
                    setApproveTo('')
                  }}
                  className="px-3 py-2 text-sm bg-zinc-300 dark:bg-zinc-700 text-zinc-900 dark:text-zinc-50 rounded hover:bg-zinc-400 dark:hover:bg-zinc-600 transition-colors"
                >
                  취소
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
