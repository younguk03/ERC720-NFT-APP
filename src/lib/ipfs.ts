/**
 * IPFS 업로드 유틸리티
 * Pinata API를 사용하여 파일과 메타데이터를 IPFS에 업로드합니다.
 */

export interface PinataResponse {
  IpfsHash: string
  PinSize: number
  Timestamp: string
}

export interface NFTMetadata {
  name: string
  description: string
  image: string
  attributes?: Array<{
    trait_type: string
    value: string | number
  }>
}

/**
 * Pinata에 파일 업로드
 * @param file 업로드할 파일
 * @returns IPFS 해시 (CID)
 */
export async function uploadFileToIPFS(file: File): Promise<string> {
  const PINATA_JWT = process.env.NEXT_PUBLIC_PINATA_JWT

  if (!PINATA_JWT || PINATA_JWT === 'your_pinata_jwt_token_here') {
    throw new Error(
      'Pinata JWT가 설정되지 않았습니다.\n.env.local 파일에 NEXT_PUBLIC_PINATA_JWT를 설정해주세요.\n자세한 내용은 IPFS_SETUP.md를 참고하세요.'
    )
  }

  const formData = new FormData()
  formData.append('file', file)

  // Pinata 옵션 설정
  const pinataMetadata = JSON.stringify({
    name: file.name,
  })

  const pinataOptions = JSON.stringify({
    cidVersion: 1,
  })

  formData.append('pinataMetadata', pinataMetadata)
  formData.append('pinataOptions', pinataOptions)

  try {
    console.log('IPFS 업로드 시작:', file.name, file.size, 'bytes')
    
    const response = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${PINATA_JWT}`,
      },
      body: formData,
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: { message: '알 수 없는 오류' } }))
      console.error('Pinata API 오류:', errorData)
      throw new Error(
        errorData.error?.message || 
        `파일 업로드 실패 (${response.status}: ${response.statusText})`
      )
    }

    const data: PinataResponse = await response.json()
    console.log('IPFS 업로드 성공:', data.IpfsHash)
    return data.IpfsHash
  } catch (error: any) {
    console.error('IPFS 업로드 오류:', error)
    if (error.message) {
      throw error
    }
    throw new Error(error.message || '파일 업로드에 실패했습니다.')
  }
}

/**
 * Pinata에 JSON 메타데이터 업로드
 * @param metadata NFT 메타데이터 객체
 * @returns IPFS 해시 (CID)
 */
export async function uploadMetadataToIPFS(metadata: NFTMetadata): Promise<string> {
  const PINATA_JWT = process.env.NEXT_PUBLIC_PINATA_JWT

  if (!PINATA_JWT || PINATA_JWT === 'your_pinata_jwt_token_here') {
    throw new Error(
      'Pinata JWT가 설정되지 않았습니다.\n.env.local 파일에 NEXT_PUBLIC_PINATA_JWT를 설정해주세요.\n자세한 내용은 IPFS_SETUP.md를 참고하세요.'
    )
  }

  const pinataMetadata = JSON.stringify({
    name: `NFT Metadata - ${metadata.name}`,
  })

  const pinataOptions = JSON.stringify({
    cidVersion: 1,
  })

  try {
    console.log('메타데이터 업로드 시작:', metadata.name)
    
    const response = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${PINATA_JWT}`,
      },
      body: JSON.stringify({
        pinataContent: metadata,
        pinataMetadata: JSON.parse(pinataMetadata),
        pinataOptions: JSON.parse(pinataOptions),
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: { message: '알 수 없는 오류' } }))
      console.error('Pinata API 오류:', errorData)
      throw new Error(
        errorData.error?.message || 
        `메타데이터 업로드 실패 (${response.status}: ${response.statusText})`
      )
    }

    const data: PinataResponse = await response.json()
    console.log('메타데이터 업로드 성공:', data.IpfsHash)
    return data.IpfsHash
  } catch (error: any) {
    console.error('메타데이터 업로드 오류:', error)
    if (error.message) {
      throw error
    }
    throw new Error(error.message || '메타데이터 업로드에 실패했습니다.')
  }
}

/**
 * IPFS 해시를 IPFS URL로 변환
 * @param hash IPFS 해시 (CID)
 * @returns IPFS URL
 */
export function getIPFSUrl(hash: string): string {
  return `ipfs://${hash}`
}

/**
 * IPFS 해시를 HTTP URL로 변환 (게이트웨이 사용)
 * @param hash IPFS 해시 (CID)
 * @param gateway IPFS 게이트웨이 URL (기본값: Pinata 공개 게이트웨이)
 * @returns HTTP URL
 */
export function getIPFSGatewayUrl(
  hash: string,
  gateway: string = 'https://gateway.pinata.cloud/ipfs/'
): string {
  return `${gateway}${hash}`
}
