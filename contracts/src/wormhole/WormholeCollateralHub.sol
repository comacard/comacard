// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {
    ReentrancyGuardUpgradeable
} from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";

import {Governed} from "../governance/Governed.sol";
import {IRemoteCollateral} from "../interfaces/IRemoteCollateral.sol";
import {IWormhole} from "../interfaces/IWormhole.sol";
import {CollateralMessage} from "../libraries/CollateralMessage.sol";
import {CreditErrors} from "../types/CreditTypes.sol";

interface IScoreRefresher {
    function refreshScore(address account) external;
}

/// @title WormholeCollateralHub
/// @notice Accounts for collateral deposited on chains Attestcoin cannot reach.
///
/// @dev Attestcoin proves transactions from Ethereum and Sepolia. Base,
///      Arbitrum, Optimism, BSC and Avalanche need a different carrier, and the
///      only one Creditcoin has is the Wormhole Core Contract — no token bridge,
///      no relayer, just signed messages that somebody has to deliver.
///
///      A WormholeVault on each chain holds the deposit and publishes a message
///      saying so. This contract reads that message. The asset itself never
///      moves, which is the same promise the Attestcoin path makes.
///
///      It is a contract of its own rather than more code in ASCCreditLine
///      because that one is within a kilobyte of the 24KB deploy limit and its
///      storage holds live collateral.
contract WormholeCollateralHub is IRemoteCollateral, Governed, ReentrancyGuardUpgradeable {
    /// @notice Creditcoin's Wormhole Core Contract, which verifies guardian
    ///         signatures and nothing else.
    IWormhole public wormhole;

    /// @notice The credit line told to re-publish a score after a deposit.
    address public creditLine;

    /// @notice The one vault per chain whose messages are honoured, by Wormhole
    ///         chain id.
    /// @dev Without this, anyone could deploy their own vault, lock nothing, and
    ///      publish a message the guardians would sign quite happily.
    mapping(uint16 => bytes32) public vaultPeer;

    /// @notice Messages already applied, by VAA hash.
    /// @dev Wormhole says a message is authentic. It never says it is fresh.
    mapping(bytes32 => bool) public consumedVaa;

    /// @notice How the protocol values a remote asset.
    /// @param price Credit-asset wei per ONE WHOLE unit, 18-decimal fixed point.
    /// @param decimals The asset's own decimals on its own chain.
    struct RemoteAsset {
        uint256 price;
        uint8 decimals;
        bool listed;
    }

    /// @notice Listed assets, keyed by `CollateralMessage.assetId`.
    /// @dev Keyed by chain *and* address: USDC on Base and USDC on Arbitrum are
    ///      different tokens in different vaults, and a depeg on one says nothing
    ///      about the other.
    mapping(bytes32 => RemoteAsset) public remoteAsset;

    /// @notice Every listed asset id, so value can be summed across them.
    bytes32[] internal _assets;

    /// @notice Collateral credited per account, per asset id.
    mapping(address => mapping(bytes32 => uint256)) public collateralOf;

    /// @notice Listing more than this would make every valuation loop too far.
    uint256 internal constant MAX_ASSETS = 32;

    uint256 internal constant PRICE_SCALE = 1e18;

    event VaultPeerChanged(uint16 indexed chainId, bytes32 from, bytes32 to);
    event AssetListed(
        bytes32 indexed assetId,
        uint16 indexed chainId,
        bytes32 token,
        uint8 decimals,
        uint256 price
    );
    event AssetPriceChanged(bytes32 indexed assetId, uint256 from, uint256 to);
    event RemoteCollateralCredited(
        address indexed account, bytes32 indexed assetId, uint256 amount, bytes32 indexed vaaHash
    );
    event CreditLineChanged(address indexed from, address indexed to);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address wormhole_,
        address creditLine_,
        address governance,
        address operator,
        uint48 adminTransferDelay
    ) external initializer {
        if (wormhole_ == address(0) || creditLine_ == address(0)) {
            revert CreditErrors.ZeroAddress();
        }
        __Governed_init(governance, adminTransferDelay);
        __ReentrancyGuard_init();
        wormhole = IWormhole(wormhole_);
        creditLine = creditLine_;
        _grantRole(ORACLE_ROLE, operator);
        _grantRole(OPERATOR_ROLE, operator);
    }

    // --------------------------------------------------------------------
    // Receiving
    // --------------------------------------------------------------------

    /// @notice Credit collateral a WormholeVault locked on another chain.
    /// @param vaa The signed message, as served by any guardian or Wormholescan.
    ///
    /// @dev Permissionless. Nothing here trusts the caller, so the borrower, our
    ///      worker, or a stranger willing to pay the gas may all deliver it.
    ///      Four things have to hold: the guardians signed it, it came from the
    ///      vault we know on that chain, we have not applied it already, and the
    ///      asset is one we price.
    function receiveFromWormhole(bytes calldata vaa)
        external
        whenNotPaused
        nonReentrant
        returns (address account, bytes32 assetId, uint256 amount)
    {
        (IWormhole.Vm memory vaaData, bool valid, string memory reason) =
            wormhole.parseAndVerifyVM(vaa);
        if (!valid) revert CreditErrors.VaaInvalid(reason);

        bytes32 peer = vaultPeer[vaaData.emitterChainId];
        if (peer == bytes32(0) || peer != vaaData.emitterAddress) {
            revert CreditErrors.UnknownPeer(vaaData.emitterChainId, vaaData.emitterAddress);
        }
        if (consumedVaa[vaaData.hash]) revert CreditErrors.VaaAlreadyConsumed(vaaData.hash);
        consumedVaa[vaaData.hash] = true;

        CollateralMessage.Deposit memory d = CollateralMessage.decode(vaaData.payload);
        assetId = CollateralMessage.assetId(vaaData.emitterChainId, d.token);

        RemoteAsset storage asset = remoteAsset[assetId];
        if (!asset.listed) revert CreditErrors.AssetNotListed(assetId);
        // The vault reports the decimals it read off the token. If they disagree
        // with what was listed, one of the two is wrong about the token and the
        // valuation would be off by orders of magnitude. Better to refuse than
        // to pick a side.
        if (asset.decimals != d.decimals) {
            revert CreditErrors.DecimalsMismatch(asset.decimals, d.decimals);
        }
        if (d.amount == 0) revert CreditErrors.ZeroAmount();

        account = d.account;
        amount = d.amount;
        collateralOf[account][assetId] += amount;

        emit RemoteCollateralCredited(account, assetId, amount, vaaData.hash);
        IScoreRefresher(creditLine).refreshScore(account);
    }

    // --------------------------------------------------------------------
    // Valuation
    // --------------------------------------------------------------------

    /// @inheritdoc IRemoteCollateral
    /// @dev Each asset is scaled by its own decimals before pricing. That is the
    ///      difference between a correct limit and one that is off by twelve
    ///      orders of magnitude for a 6-decimal stablecoin.
    function valueOf(address account) external view returns (uint256 value) {
        for (uint256 i = 0; i < _assets.length; ++i) {
            bytes32 assetId = _assets[i];
            uint256 held = collateralOf[account][assetId];
            if (held == 0) continue;
            RemoteAsset storage asset = remoteAsset[assetId];
            value += (held * asset.price) / (10 ** asset.decimals);
        }
    }

    // --------------------------------------------------------------------
    // Administration
    // --------------------------------------------------------------------

    /// @notice Name the one vault on a chain whose messages count.
    /// @dev Setting it to zero stops accepting that chain without touching
    ///      collateral already credited from it.
    function setVaultPeer(uint16 chainId, bytes32 vault) external onlyRole(DEFAULT_ADMIN_ROLE) {
        emit VaultPeerChanged(chainId, vaultPeer[chainId], vault);
        vaultPeer[chainId] = vault;
    }

    /// @notice Accept an asset from a remote chain and say what it is worth.
    /// @param token The token's address on its own chain as bytes32, or zero for
    ///        that chain's native coin. bytes32 because not every chain Wormhole
    ///        reaches has twenty-byte addresses.
    function listAsset(uint16 chainId, bytes32 token, uint8 decimals, uint256 price)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
        returns (bytes32 assetId)
    {
        if (price == 0) revert CreditErrors.ZeroAmount();
        if (decimals > 36) revert CreditErrors.DecimalsOutOfRange(decimals);
        if (_assets.length >= MAX_ASSETS) revert CreditErrors.DecimalsOutOfRange(decimals);

        assetId = CollateralMessage.assetId(chainId, token);
        if (remoteAsset[assetId].listed) revert CreditErrors.AssetAlreadyListed(assetId);

        remoteAsset[assetId] = RemoteAsset({price: price, decimals: decimals, listed: true});
        _assets.push(assetId);
        emit AssetListed(assetId, chainId, token, decimals, price);
    }

    /// @notice Reprice a listed asset.
    function setAssetPrice(bytes32 assetId, uint256 price) external onlyRole(ORACLE_ROLE) {
        RemoteAsset storage asset = remoteAsset[assetId];
        if (!asset.listed) revert CreditErrors.AssetNotListed(assetId);
        if (price == 0) revert CreditErrors.ZeroAmount();
        emit AssetPriceChanged(assetId, asset.price, price);
        asset.price = price;
    }

    function setCreditLine(address next) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (next == address(0)) revert CreditErrors.ZeroAddress();
        emit CreditLineChanged(creditLine, next);
        creditLine = next;
    }

    /// @notice Every asset the hub accepts, in listing order.
    function listedAssets() external view returns (bytes32[] memory) {
        return _assets;
    }
}
