// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";

import {IWormhole} from "../interfaces/IWormhole.sol";
import {CollateralMessage} from "../libraries/CollateralMessage.sol";

interface IWormholeVault {
    function approveRelease(address account, address token, uint256 amount) external;
    function operator() external view returns (address);
}

/// @title ReleaseRelay
/// @notice Turns a signed message from Creditcoin into a withdrawal a borrower
///         can take, without a person in between.
///
/// @dev `WormholeVault.approveRelease` is operator-gated, and until now the
///      operator was us. That was honest but custodial: a borrower's collateral
///      came back when we said so.
///
///      This contract holds that role instead. It approves nothing of its own
///      accord — it only relays what the guardians signed, which is what
///      `WormholeCollateralHub` published after checking on Creditcoin that the
///      borrower's debt still stands up without the collateral.
///
///      It is deployed beside an existing vault rather than built into one, so
///      the vaults already holding collateral do not have to be replaced. The
///      only change to a live vault is `setOperator(thisContract)`.
contract ReleaseRelay is Ownable2Step {
    /// @notice The chain's own Wormhole Core Contract.
    IWormhole public immutable WORMHOLE;

    /// @notice The vault whose releases this relays.
    IWormholeVault public immutable VAULT;

    /// @notice Wormhole chain id of Creditcoin, the only chain that may release.
    uint16 public immutable HUB_CHAIN_ID;

    /// @notice The hub on Creditcoin, as bytes32. Changeable: the hub sits
    ///         behind a proxy, but a migration would move it.
    bytes32 public hub;

    /// @notice Messages already acted on, by VAA hash.
    mapping(bytes32 => bool) public consumedVaa;

    event Released(address indexed account, address indexed token, uint256 amount, bytes32 vaaHash);
    event HubChanged(bytes32 from, bytes32 to);

    error VaaInvalid(string reason);
    error NotTheHub(uint16 chainId, bytes32 emitter);
    error AlreadyConsumed(bytes32 hash);
    error NotTheOperator(address vaultOperator);

    constructor(
        address wormhole,
        address vault,
        uint16 hubChainId,
        bytes32 hub_,
        address governance
    ) Ownable(governance) {
        WORMHOLE = IWormhole(wormhole);
        VAULT = IWormholeVault(vault);
        HUB_CHAIN_ID = hubChainId;
        hub = hub_;
    }

    /// @notice Let a borrower withdraw what Creditcoin has released.
    /// @param vaa The signed message, from any guardian or from Wormholescan.
    ///
    /// @dev Permissionless, like the deposit path: nothing here trusts the
    ///      caller. The borrower can submit it themselves and never wait for us.
    function executeRelease(bytes calldata vaa) external {
        (IWormhole.Vm memory vaaData, bool valid, string memory reason) =
            WORMHOLE.parseAndVerifyVM(vaa);
        if (!valid) revert VaaInvalid(reason);

        // Only Creditcoin, and only our hub on it. Any other emitter could
        // otherwise release every vault on this chain.
        if (vaaData.emitterChainId != HUB_CHAIN_ID || vaaData.emitterAddress != hub) {
            revert NotTheHub(vaaData.emitterChainId, vaaData.emitterAddress);
        }
        if (consumedVaa[vaaData.hash]) revert AlreadyConsumed(vaaData.hash);
        consumedVaa[vaaData.hash] = true;

        // decodeRelease refuses a deposit payload, so a message meant for the
        // hub cannot be replayed here as a withdrawal.
        CollateralMessage.Deposit memory d = CollateralMessage.decodeRelease(vaaData.payload);
        address token = address(uint160(uint256(d.token)));

        VAULT.approveRelease(d.account, token, d.amount);
        emit Released(d.account, token, d.amount, vaaData.hash);
    }

    /// @notice Point at a different hub, if the one on Creditcoin ever moves.
    function setHub(bytes32 next) external onlyOwner {
        emit HubChanged(hub, next);
        hub = next;
    }

    /// @notice Whether the vault has actually handed this contract the role.
    /// @dev Deploying the relay does nothing until `vault.setOperator` is
    ///      called, and a release that reverts for that reason looks like a
    ///      broken withdrawal rather than a missing setup step.
    function armed() external view returns (bool) {
        return VAULT.operator() == address(this);
    }

    /// @notice Fails loudly if the vault has not handed over the role yet.
    function requireArmed() external view {
        address current = VAULT.operator();
        if (current != address(this)) revert NotTheOperator(current);
    }
}
