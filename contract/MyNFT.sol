// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20; // Solidity 버전은 Remix에서 사용하는 버전에 맞게 조정할 수 있습니다.
// OpenZeppelin ERC721 및 기타 확장 기능 import
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
// ERC721, URIStorage, Ownable을 상속받는 사용자 정의 NFT 컨트랙트
contract MyNFT is ERC721, ERC721URIStorage, Ownable {
  using Counters for Counters.Counter;
  Counters.Counter private _tokenIdCounter;
  // 토큰 이름과 심볼을 설정하는 생성자
  constructor()
    ERC721("MyTestNFT", "MTN")
    Ownable(msg.sender) // 배포자를 컨트랙트 소유자로 설정
  {}
  /**
  * @notice 새로운 NFT를 생성(민트)하고 소유자에게 전송합니다.
  * @param to NFT를 받을 주소
  * @param _tokenURI NFT 메타데이터 JSON 파일의 URI (IPFS 등에 업로드된 주소)
  */
  function safeMint(address to, string memory _tokenURI)
    public
    onlyOwner // 오직 컨트랙트 소유자만 민팅 가능
  {
    uint256 tokenId = _tokenIdCounter.current(); // 현재 토큰 ID 가져오기
    _tokenIdCounter.increment(); // 다음 토큰 ID로 증가
    _safeMint(to, tokenId); // NFT 민팅 (ERC721 기본 함수)
    _setTokenURI(tokenId, _tokenURI); // NFT 메타데이터 URI 설정 (ERC721URIStorage)
  }
  // ERC721 및 ERC721URIStorage의 tokenURI 함수 오버라이드
  function tokenURI(uint256 tokenId)
    public
    view
    override(ERC721, ERC721URIStorage)
    returns (string memory)
  {
    return super.tokenURI(tokenId);
  }
  // ERC721, ERC721URIStorage, Ownable의 supportsInterface 함수 오버라이드
  function supportsInterface(bytes4 interfaceId)
    public
    view
    override(ERC721, ERC721URIStorage)
    returns (bool)
  {
    return super.supportsInterface(interfaceId);
  }
}
