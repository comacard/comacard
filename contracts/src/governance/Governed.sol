// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {
    AccessControlDefaultAdminRulesUpgradeable
} from "@openzeppelin/contracts-upgradeable/access/extensions/AccessControlDefaultAdminRulesUpgradeable.sol";
import {
    PausableUpgradeable
} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/// @title Governed
/// @notice Shared governance surface for the Comacard contracts.
///
/// @dev Separating these roles is the point. A single key that can both run
///      daily operations and change the rules is the failure everyone regrets:
///
///      - `DEFAULT_ADMIN_ROLE` belongs to governance — a multisig or timelock.
///        It grants every other role, changes configuration, and is the only
///        role that can authorise an upgrade. Its own handover is two-step with
///        a delay, inherited from `AccessControlDefaultAdminRules`.
///      - `OPERATOR_ROLE` is a hot key: it moves liquidity and approves
///        releases, and can do nothing else.
///      - `GUARDIAN_ROLE` can only pause. Halting is the one action worth taking
///        instantly and without deliberation, so it is cheap to hold and useless
///        for anything else.
///      - `COMPLIANCE_ROLE` can freeze an account, and only that.
///      - `ORACLE_ROLE` can price the collateral asset, and only that. It is a
///        hot key that mints borrowing power, so it is deliberately separate
///        from the key that moves liquidity.
///
///      Unpausing is deliberately not a guardian power: stopping the system
///      should be easy, restarting it should require governance. Upgrades are
///      restricted to governance for the same reason.
abstract contract Governed is
    AccessControlDefaultAdminRulesUpgradeable,
    PausableUpgradeable,
    UUPSUpgradeable
{
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    bytes32 public constant GUARDIAN_ROLE = keccak256("GUARDIAN_ROLE");
    bytes32 public constant COMPLIANCE_ROLE = keccak256("COMPLIANCE_ROLE");
    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");

    /// @custom:storage-location erc7201:comacard.storage.Governed
    struct GovernedStorage {
        mapping(address => bool) frozen;
    }

    // keccak256(abi.encode(uint256(keccak256("comacard.storage.Governed")) - 1)) & ~bytes32(uint256(0xff))
    bytes32 private constant GOVERNED_STORAGE =
        0x4e41629c70935e18ccd86f9d8d1cd628d100640fed9911ebe3b51528ab102700;

    /// @param account The frozen or unfrozen account.
    /// @param isFrozen Its new state.
    /// @param reason Free-text justification, recorded for the audit trail.
    event AccountFrozen(address indexed account, bool isFrozen, string reason);

    error AccountIsFrozen(address account);

    function _governedStorage() private pure returns (GovernedStorage storage $) {
        bytes32 slot = GOVERNED_STORAGE;
        assembly {
            $.slot := slot
        }
    }

    /// @param governance Multisig or timelock holding `DEFAULT_ADMIN_ROLE`.
    /// @param adminTransferDelay Seconds a governance handover must wait.
    // forge-lint: disable-next-line(mixed-case-function)
    function __Governed_init(address governance, uint48 adminTransferDelay)
        internal
        onlyInitializing
    {
        __AccessControlDefaultAdminRules_init(adminTransferDelay, governance);
        __Pausable_init();
        __UUPSUpgradeable_init();
    }

    /// @notice Whether an account is barred from moving value.
    function frozen(address account) public view returns (bool) {
        return _governedStorage().frozen[account];
    }

    modifier notFrozen(address account) {
        _requireNotFrozen(account);
        _;
    }

    function _requireNotFrozen(address account) internal view {
        if (frozen(account)) revert AccountIsFrozen(account);
    }

    /// @notice Bar an account from moving value, or lift the bar.
    /// @dev Freezing never confiscates. A frozen account keeps its balance and
    ///      its record; only movement stops, so a compliance hold cannot quietly
    ///      become a seizure.
    function setFrozen(address account, bool isFrozen, string calldata reason)
        external
        onlyRole(COMPLIANCE_ROLE)
    {
        _governedStorage().frozen[account] = isFrozen;
        emit AccountFrozen(account, isFrozen, reason);
    }

    /// @notice Halt value movement immediately.
    function pause() external onlyRole(GUARDIAN_ROLE) {
        _pause();
    }

    /// @notice Resume. Governance only — restarting deserves deliberation.
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    /// @inheritdoc UUPSUpgradeable
    function _authorizeUpgrade(address) internal override onlyRole(DEFAULT_ADMIN_ROLE) {}
}
