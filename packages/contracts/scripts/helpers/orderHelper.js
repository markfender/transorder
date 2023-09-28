const { time } = require("@nomicfoundation/hardhat-network-helpers")

const { GAS_COST, GAS_AMOUNT, INITIAL_EXECUTOR_REWARD, LOCKED_GUARANTEE_PER_GAS } = require("../constants/index.js")
// @notice `executor` should has tokens on the balance
async function createOrder(
  orderCreator,
  gasContract,
  tokenContract,
  isAccepted = false,
  executor,
  possibleExecutionStart = 36000,
  possibleExecutionDeadline = 864000,
  increaseTime = 0,
) {
  const latestTime = await time.latest()
  await tokenContract.connect(orderCreator).approve(gasContract.target, INITIAL_EXECUTOR_REWARD + GAS_COST * GAS_AMOUNT)
  await gasContract
    .connect(orderCreator)
    .createOrder(
      GAS_AMOUNT,
      latestTime + possibleExecutionStart,
      latestTime + possibleExecutionDeadline,
      40,
      true,
      [tokenContract.target, INITIAL_EXECUTOR_REWARD],
      [tokenContract.target, GAS_COST],
      [tokenContract.target, LOCKED_GUARANTEE_PER_GAS],
      INITIAL_EXECUTOR_REWARD,
      GAS_COST * GAS_AMOUNT,
    )

  if (isAccepted) {
    await tokenContract.connect(executor).approve(gasContract.target, GAS_AMOUNT * LOCKED_GUARANTEE_PER_GAS)
    // @notice the maximum value is `100`
    const ordersAmount = await gasContract.totalMatchingOrdersCount(
      ethers.ZeroAddress,
      0, // OrderStatus.None
    )

    // Accepting order
    await gasContract.connect(executor).acceptOrder(parseInt(ordersAmount) - 1, GAS_AMOUNT * LOCKED_GUARANTEE_PER_GAS)
  }

  if (increaseTime != 0) {
    await time.increase(increaseTime)
  }
}

module.exports = { createOrder }