// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IWormhole} from "../../src/interfaces/IWormhole.sol";

/// @notice Stands in for the Wormhole Core Contract.
/// @dev Guardian signatures cannot be produced locally, so the mock treats the
///      "VAA" as an already-parsed Vm and reports whether it should verify. What
///      the tests are actually about is everything the credit line does *after*
///      verification — the peer check, the replay check, the decimals check —
///      and none of that depends on real signatures.
contract MockWormhole is IWormhole {
    uint256 public messageFee;
    uint16 public chainId;

    /// @notice Set false to make every VAA fail verification.
    bool public verifies = true;

    uint64 public sequence;

    struct Published {
        uint32 nonce;
        bytes payload;
        uint8 consistencyLevel;
        uint256 feePaid;
    }

    Published[] public published;

    constructor(uint16 chainId_, uint256 fee) {
        chainId = chainId_;
        messageFee = fee;
    }

    function setVerifies(bool v) external {
        verifies = v;
    }

    function publishMessage(uint32 nonce, bytes memory payload, uint8 consistencyLevel)
        external
        payable
        returns (uint64)
    {
        require(msg.value >= messageFee, "fee");
        published.push(
            Published({
                nonce: nonce,
                payload: payload,
                consistencyLevel: consistencyLevel,
                feePaid: msg.value
            })
        );
        return sequence++;
    }

    function publishedCount() external view returns (uint256) {
        return published.length;
    }

    function publishedPayload(uint256 i) external view returns (bytes memory) {
        return published[i].payload;
    }

    // forge-lint: disable-next-line(mixed-case-function)
    function parseAndVerifyVM(bytes calldata encodedVm)
        external
        view
        returns (Vm memory vm, bool valid, string memory reason)
    {
        vm = abi.decode(encodedVm, (Vm));
        valid = verifies;
        reason = verifies ? "" : "VM signature invalid";
    }

    /// @notice Build the bytes this mock accepts, the way a guardian would.
    function buildVaa(uint16 emitterChain, bytes32 emitter, uint64 seq, bytes memory payload)
        external
        pure
        returns (bytes memory)
    {
        Vm memory vm = Vm({
            version: 1,
            timestamp: 0,
            nonce: 0,
            emitterChainId: emitterChain,
            emitterAddress: emitter,
            sequence: seq,
            consistencyLevel: 1,
            payload: payload,
            guardianSetIndex: 0,
            signatures: new Signature[](0),
            hash: keccak256(abi.encodePacked(emitterChain, emitter, seq))
        });
        return abi.encode(vm);
    }
}
