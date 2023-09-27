const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers")
const { expect } = require("chai")

const CONSTANTS = require("../scripts/constants/index.js")
const orderHelper = require("../scripts/helpers/orderHelper.js")

const { PROJECT_NAME, PROJECT_VERSION, VALIDATOR_THRESHOLD, VALIDATORS } = require("../scripts/constants/executor.js")

//@todo setup pretifier

describe("GasOrder", function () {
  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshot in every test.
  const SYSTEM_FEE = 1000 // 100 = 1%
  async function initialSetup() {
    const [admin, ...accounts] = await ethers.getSigners()

    const ExecutorFactory = await ethers.getContractFactory("Executor")
    const GasOrderFactory = await ethers.getContractFactory("GasOrder")
    // @todo precalculate it automaticaly
    const GAS_ORDER_ADDRESS = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512"
    const TOKEN_LINK = ""

    const ExecutorContract = await ExecutorFactory.deploy(
      GAS_ORDER_ADDRESS,
      PROJECT_NAME,
      PROJECT_VERSION,
      VALIDATOR_THRESHOLD,
      VALIDATORS,
    )
    await ExecutorContract.deploymentTransaction().wait()
    // @todo add deploy error handling
    console.log(`Executor contract deployed: ${ExecutorContract.target}`)

    const GasOrderContract = await GasOrderFactory.deploy(ExecutorContract.target, TOKEN_LINK)
    await GasOrderContract.deploymentTransaction().wait()
    console.log(`GasOrder contract deployed: ${GasOrderContract.target}`)

    const TokenFactory = await ethers.getContractFactory("MockToken")
    const TokenContract = await TokenFactory.deploy("MockUSD", "MUSD", "1000000000000") // @todo use ethers function to specify token amount
    await TokenContract.transfer(accounts[1], 20000000)
    await TokenContract.transfer(accounts[2], 20000000)

    await TokenContract.deploymentTransaction().wait()

    await GasOrderContract.setFee(0, SYSTEM_FEE)
    await GasOrderContract.setFee(1, SYSTEM_FEE)
    await GasOrderContract.setFee(2, SYSTEM_FEE)

    return { accounts, admin, ExecutorContract, GasOrderContract, TokenContract }
  }

  describe("Order operations", function () {
    it("Should create a new order", async function () {
      const { admin, GasOrderContract, TokenContract } = await loadFixture(initialSetup)

      const tokensBalanceBefore = await TokenContract.balanceOf(admin.address)

      await orderHelper.createOrder(admin, GasOrderContract, TokenContract)

      const tokensBalanceAfter = await TokenContract.balanceOf(admin.address)

      // @todo add more asserts statements
      expect(tokensBalanceBefore - tokensBalanceAfter).to.equal(
        CONSTANTS.INITIAL_EXECUTOR_REWARD + CONSTANTS.GAS_COST * CONSTANTS.GAS_AMOUNT,
      )
    })

    it("Should close order and send back prepaid fund for unspent Gas", async function () {
      const { admin, GasOrderContract, TokenContract } = await loadFixture(initialSetup)

      const tokensBalanceBefore = await TokenContract.balanceOf(admin.address)

      await orderHelper.createOrder(admin, GasOrderContract, TokenContract, 36000, 865000, 36001)

      const tokensBalanceAfter = await TokenContract.balanceOf(admin.address)

      await GasOrderContract.revokeOrder(0)

      const tokensBalanceAfterRepay = await TokenContract.balanceOf(admin.address)

      // @todo add more asserts statements
      expect(tokensBalanceBefore - tokensBalanceAfter).to.equal(
        CONSTANTS.INITIAL_EXECUTOR_REWARD + CONSTANTS.GAS_COST * CONSTANTS.GAS_AMOUNT,
      )

      expect(tokensBalanceBefore).to.equal(tokensBalanceAfterRepay)
    })

    it("Executor should accept a new order", async function () {
      const { accounts, admin, GasOrderContract, TokenContract } = await loadFixture(initialSetup)

      await orderHelper.createOrder(admin, GasOrderContract, TokenContract, 36000, 865000)

      await TokenContract.transfer(accounts[0].address, CONSTANTS.GAS_AMOUNT * CONSTANTS.LOCKED_GUARANTEE_PER_GAS)
      await TokenContract.connect(accounts[0]).approve(
        GasOrderContract.target,
        CONSTANTS.GAS_AMOUNT * CONSTANTS.LOCKED_GUARANTEE_PER_GAS,
      )

      await GasOrderContract.connect(accounts[0]).acceptOrder(
        0,
        CONSTANTS.GAS_AMOUNT * CONSTANTS.LOCKED_GUARANTEE_PER_GAS,
      )
      let withdrawableAmount = (CONSTANTS.INITIAL_EXECUTOR_REWARD * (10000 - SYSTEM_FEE)) / 10000
      await GasOrderContract.connect(accounts[0]).claim(TokenContract.target, withdrawableAmount)

      const tokensBalanceAfter = await TokenContract.balanceOf(accounts[0].address)

      const amountOfERC1155GasTokens = await GasOrderContract.balanceOf(admin.address, 0)

      expect(tokensBalanceAfter).to.equal(withdrawableAmount)

      expect(amountOfERC1155GasTokens).to.equal(CONSTANTS.GAS_AMOUNT)
    })

    it("Should fail to retrive prepaid tokens from order if not enough ERC1155 Gas tokens on balance", async function () {
      const { accounts, admin, GasOrderContract, TokenContract } = await loadFixture(initialSetup)

      await orderHelper.createOrder(admin, GasOrderContract, TokenContract, 36000, 865000)

      await TokenContract.transfer(accounts[0].address, CONSTANTS.GAS_AMOUNT * CONSTANTS.LOCKED_GUARANTEE_PER_GAS)
      await TokenContract.connect(accounts[0]).approve(
        GasOrderContract.target,
        CONSTANTS.GAS_AMOUNT * CONSTANTS.LOCKED_GUARANTEE_PER_GAS,
      )

      // Accepting order
      await GasOrderContract.connect(accounts[0]).acceptOrder(
        0,
        CONSTANTS.GAS_AMOUNT * CONSTANTS.LOCKED_GUARANTEE_PER_GAS,
      )
      let withdrawableAmount = (CONSTANTS.INITIAL_EXECUTOR_REWARD * (10000 - SYSTEM_FEE)) / 10000
      await GasOrderContract.connect(accounts[0]).claim(TokenContract.target, withdrawableAmount)

      await GasOrderContract.connect(admin).safeTransferFrom(
        admin.address,
        accounts[0].address,
        0,
        CONSTANTS.GAS_AMOUNT,
        "0x",
      )

      const txToBeReverted = GasOrderContract.connect(admin).retrieveGasCost(admin.address, 0, CONSTANTS.GAS_AMOUNT)

      await expect(txToBeReverted).to.be.reverted
    })
  })
  describe("Order getter", function () {
    it("Should get orders with spesific owner", async function () {
      const { accounts, admin, GasOrderContract, TokenContract } = await loadFixture(initialSetup)
      // @notice orders mockups
      await orderHelper.createOrder(admin, GasOrderContract, TokenContract)
      await orderHelper.createOrder(accounts[1], GasOrderContract, TokenContract)
      await orderHelper.createOrder(accounts[1], GasOrderContract, TokenContract)
      await orderHelper.createOrder(accounts[1], GasOrderContract, TokenContract)
      await orderHelper.createOrder(accounts[2], GasOrderContract, TokenContract)
      await orderHelper.createOrder(accounts[2], GasOrderContract, TokenContract)

      const totalAmountOfOrders = await GasOrderContract.totalMatchingOrdersCount(
        ethers.ZeroAddress,
        0, // OrderStatus.None
      )

      expect(totalAmountOfOrders).to.be.eq(6)

      const ordersWithAccount2Owner = await GasOrderContract.getFilteredOrders(
        accounts[2].address,
        0, // OrderStatus.None
        100,
        0,
      )
      // @todo rewrite expected statements for an array
      expect(ordersWithAccount2Owner.length).to.be.eq(2)
      expect(ordersWithAccount2Owner[0][0]).to.be.eq(4) // order number
      expect(ordersWithAccount2Owner[0][3]).to.be.eq(2000) // order number
    })
  })
})
