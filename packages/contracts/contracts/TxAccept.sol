// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.20;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

import "./Executor.sol";

import "./base/GasOrderGetters.sol";
import {Message} from "./base/ExecutionMessage.sol";
import {OrderStatus} from "./interfaces/IGasOrder.sol";

abstract contract TxAccept is GasOrderGetters {
  using ECDSA for bytes32;

  mapping(address => mapping(uint256 => bool)) public nonce;
  mapping(address => mapping(uint256 => uint256)) public lock;

  function addTransaction(
    Message calldata message,
    bytes calldata signature
  ) public specificStatus(message.gasOrder, OrderStatus.Active) {
    bytes32 hash = Executor(execution()).messageHash(message);

    address recovered = hash.recover(signature);
    if (recovered != message.from) revert UnknownRecovered(recovered);

    // @todo update error to `InvalidSignature`
    if (nonce[message.from][message.nonce]) revert InvalidTransaction(hash);
    nonce[message.from][message.nonce] = true;

    lock[message.from][message.nonce] = message.gas;

    uint256 balance = usable(message.onBehalf, message.gasOrder, message.from);
    if (message.gas >= balance) revert GasLimitExceedBalance(message.gas, balance);

    _increaseLock(message.from, message.gasOrder, message.gas);

    // @todo time bounds check

    // @todo add event emmiting
  }

  // @todo check if the function is needed
  function _unlockTxGasTokens(Message calldata message) internal {
    // @todo finalize
    // @todo add error, no such tx
    if (!nonce[message.from][message.nonce]) revert(); //InvalidTransaction();
    lock[message.from][message.nonce] = 0;
    //_unlockGasTokens(message.from, message.gasOrder, message.gas);
  }

  function isExecutable(Message calldata message) public view returns (bool) {
    // @todo disallow locking zero gas during the tx
    uint256 executionWindow = order(message.gasOrder).executionWindow;

    if (
      message.deadline - executionWindow * 2 < block.timestamp &&
      message.deadline - executionWindow > block.timestamp &&
      nonce[message.from][message.nonce] &&
      lock[message.from][message.nonce] > 0
    ) return true;
    else return false;
  }

  function isLiquidatable(Message calldata message) public view returns (bool) {
    // @todo finish the function validations
    // @todo disallow locking zero gas during the tx
    if (
      message.deadline - order(message.gasOrder).executionWindow >= block.timestamp &&
      message.deadline < block.timestamp &&
      nonce[message.from][message.nonce] &&
      lock[message.from][message.nonce] > 0
    ) return true;
    else return false;
  }
}
