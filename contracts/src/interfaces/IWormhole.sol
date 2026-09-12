// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice The parts of the Wormhole Core Contract this project uses.
/// @dev Creditcoin has only the Core Contract deployed — no token bridge, no
///      relayer — so raw message passing is the whole surface available, and
///      delivering the signed message is our own job.
interface IWormhole {
    struct Signature {
        bytes32 r;
        bytes32 s;
        uint8 v;
        uint8 guardianIndex;
    }

    /// @dev The struct name is ours: Solidity encodes it as a tuple, so only
    ///      the field order and types have to match Wormhole. The *function*
    ///      name does matter — it is half the selector.
    struct Vm {
        uint8 version;
        uint32 timestamp;
        uint32 nonce;
        uint16 emitterChainId;
        bytes32 emitterAddress;
        uint64 sequence;
        uint8 consistencyLevel;
        bytes payload;
        uint32 guardianSetIndex;
        Signature[] signatures;
        bytes32 hash;
    }

    function publishMessage(uint32 nonce, bytes memory payload, uint8 consistencyLevel)
        external
        payable
        returns (uint64 sequence);

    /// @dev `valid` is false rather than reverting when signatures do not check
    ///      out, so a caller that ignores it accepts forged messages.
    // forge-lint: disable-next-line(mixed-case-function)
    function parseAndVerifyVM(bytes calldata encodedVm)
        external
        view
        returns (Vm memory vm, bool valid, string memory reason);

    function messageFee() external view returns (uint256);

    function chainId() external view returns (uint16);
}
