'use client'

import { useState, useRef } from 'react'
import { uploadFileToIPFS, getIPFSGatewayUrl } from '@/lib/ipfs'

interface ImageUploadProps {
  onImageUploaded: (ipfsHash: string, imageUrl: string) => void
  disabled?: boolean
}

export default function ImageUpload({
  onImageUploaded,
  disabled,
}: ImageUploadProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadedHash, setUploadedHash] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    // 이미지 파일인지 확인
    if (!file.type.startsWith('image/')) {
      alert('이미지 파일만 업로드 가능합니다.')
      return
    }

    // 파일 크기 제한 (10MB)
    if (file.size > 10 * 1024 * 1024) {
      alert('파일 크기는 10MB 이하여야 합니다.')
      return
    }

    setSelectedFile(file)
    setUploadedHash(null)

    // 미리보기 생성
    const reader = new FileReader()
    reader.onloadend = () => {
      setPreviewUrl(reader.result as string)
    }
    reader.readAsDataURL(file)
  }

  const handleUpload = async () => {
    if (!selectedFile) return

    try {
      setIsUploading(true)
      console.log('이미지 업로드 시작...')
      const hash = await uploadFileToIPFS(selectedFile)
      console.log('업로드 완료, CID:', hash)
      setUploadedHash(hash)
      const imageUrl = getIPFSGatewayUrl(hash)
      onImageUploaded(hash, imageUrl)
    } catch (error: any) {
      console.error('이미지 업로드 오류:', error)
      const errorMessage = error.message || '이미지 업로드에 실패했습니다.'
      alert(errorMessage)
      // 에러 발생 시 상태 초기화하지 않음 (사용자가 재시도할 수 있도록)
    } finally {
      setIsUploading(false)
    }
  }

  const handleReset = () => {
    setSelectedFile(null)
    setPreviewUrl(null)
    setUploadedHash(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
          이미지 파일 선택
        </label>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileSelect}
          disabled={disabled || isUploading}
          className="block w-full text-sm text-zinc-500 dark:text-zinc-400
            file:mr-4 file:py-2 file:px-4
            file:rounded-lg file:border-0
            file:text-sm file:font-semibold
            file:bg-blue-50 file:text-blue-700
            hover:file:bg-blue-100
            dark:file:bg-blue-900 dark:file:text-blue-200
            dark:hover:file:bg-blue-800
            disabled:opacity-50 disabled:cursor-not-allowed"
        />
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          PNG, JPG, GIF 등 이미지 파일 (최대 10MB)
        </p>
      </div>

      {previewUrl && (
        <div className="space-y-2">
          <div className="relative w-full max-w-md">
            <img
              src={previewUrl}
              alt="미리보기"
              className="w-full h-auto rounded-lg border border-zinc-200 dark:border-zinc-700"
            />
            {uploadedHash && (
              <div className="absolute top-2 right-2 bg-green-500 text-white text-xs px-2 py-1 rounded">
                업로드 완료
              </div>
            )}
          </div>

          {!uploadedHash && (
            <div className="flex gap-2">
              <button
                onClick={handleUpload}
                disabled={disabled || isUploading}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors text-sm font-medium"
              >
                {isUploading ? 'IPFS 업로드 중...' : 'IPFS에 업로드'}
              </button>
              <button
                onClick={handleReset}
                disabled={disabled || isUploading}
                className="px-4 py-2 bg-zinc-300 dark:bg-zinc-700 text-zinc-900 dark:text-zinc-50 rounded-lg hover:bg-zinc-400 dark:hover:bg-zinc-600 disabled:opacity-50 transition-colors text-sm font-medium"
              >
                초기화
              </button>
            </div>
          )}

          {uploadedHash && (
            <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
              <p className="text-sm font-medium text-green-800 dark:text-green-200 mb-1">
                IPFS 업로드 완료
              </p>
              <p className="text-xs text-green-700 dark:text-green-300 break-all font-mono">
                CID: {uploadedHash}
              </p>
              <p className="text-xs text-green-700 dark:text-green-300 break-all font-mono mt-1">
                URL: ipfs://{uploadedHash}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}