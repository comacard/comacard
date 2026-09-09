// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ICreditLine} from "../../src/interfaces/ICreditLine.sol";
import {IYieldAdapter} from "../../src/interfaces/IYieldAdapter.sol";

/// @notice A yield adapter that tries to draw again while the credit line is
///         still mid-draw, standing in for a compromised or malicious venue.
contract ReentrantAdapter is IYieldAdapter {
    address public immutable CREDIT_LINE;
    uint256 public reenterWith;

    constructor(address creditLine) {
        CREDIT_LINE = creditLine;
    }

    function arm(uint256 amount) external {
        reenterWith = amount;
    }

    function deposit() external payable override {
        emit Deposited(msg.sender, msg.value);
    }

    function withdraw(uint256 amount) external override returns (uint256) {
        if (reenterWith > 0) {
            uint256 amountToReenter = reenterWith;
            reenterWith = 0;
            ICreditLine(CREDIT_LINE).draw(amountToReenter);
        }
        uint256 sending = amount > address(this).balance ? address(this).balance : amount;
        emit Withdrawn(msg.sender, sending);
        (bool ok,) = CREDIT_LINE.call{value: sending}("");
        require(ok, "send failed");
        return sending;
    }

    function totalAssets() external view override returns (uint256) {
        return address(this).balance;
    }

    function deployedPrincipal() external pure override returns (uint256) {
        return 0;
    }

    function idleBalance() external view override returns (uint256) {
        return address(this).balance;
    }

    receive() external payable {}
}
