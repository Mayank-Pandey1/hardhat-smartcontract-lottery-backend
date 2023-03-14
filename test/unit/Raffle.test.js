const { assert, expect } = require("chai");
const { network, getNamedAccounts, deployments, ethers } = require("hardhat");
const { developmentChains, networkConfig } = require("../../helper-hardhat-config");

!developmentChains.includes(network.name)
    ? describe.skip
    : describe("Raffle Unit tests", function () {
          let raffle;
          let vrfCoordinatorV2Mock;
          let deployer;
          let entranceFee;
          let interval;
          const chainId = network.config.chainId;

          beforeEach(async function () {
              deployer = (await getNamedAccounts()).deployer;
              await deployments.fixture(["all"]); //using fixture we can deploy our contracts with as many tags as we want
              //running all the deploy scripts using this line

              raffle = await ethers.getContract("Raffle", deployer);
              vrfCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock", deployer);
              entranceFee = await raffle.getEntranceFee();
              interval = await raffle.getInterval();
          });

          describe("Constructor", function () {
              it("Initializes the constructor correctly.", async function () {
                  const raffleState = await raffle.getRaffleState();
                  const interval = await raffle.getInterval();

                  assert.equal(raffleState.toString(), "0");
                  assert.equal(interval.toString(), networkConfig[chainId]["interval"]);
              });
          });

          describe("enterRaffle", function () {
              it("reverts if don't pay enough", async function () {
                  await expect(raffle.enterRaffle()).to.be.revertedWith(
                      "Raffle__NotEnoughETHEntered"
                  );
              });
              it("reverts if raffle is not open", async function () {
                  await raffle.enterRaffle({ value: entranceFee });
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1]); //we are moving our time forward and
                  await network.provider.request({ method: "evm_mine", params: [] }); //we are mining a block because we want the checkUpkeep function to be true
                  await raffle.performUpkeep([]);
                  await expect(raffle.enterRaffle({ value: entranceFee })).to.be.revertedWith(
                      "Raffle__NotOpen"
                  );
              });
              it("records players when they enter", async function () {
                  await raffle.enterRaffle({ value: entranceFee });
                  const playerFromContract = await raffle.getPlayer(0);
                  assert.equal(playerFromContract, deployer);
              });
              it("emits event on enter", async function () {
                  await expect(raffle.enterRaffle({ value: entranceFee })).to.emit(
                      raffle,
                      "RaffleEnter"
                  );
              });
          });

          describe("checkUpkeep", function () {
              it("returns false if people don't send enough ETH", async function () {
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1]);
                  await network.provider.request({ method: "evm_mine", params: [] });
                  const { upkeepNeeded } = await raffle.callStatic.checkUpkeep([]); //since checkUpkeep is a public function,
                  //it will send a transaction on the blockchain, we just want to simulate the calling of function, not actually
                  //send a transaction so we use callStatic
                  assert(!upkeepNeeded);
              });
              it("returns false if raffle isn't open", async function () {
                  await raffle.enterRaffle({ value: entranceFee });
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1]);
                  await network.provider.request({ method: "evm_mine", params: [] });
                  await raffle.performUpkeep([]);
                  const raffleState = await raffle.getRaffleState();
                  const { upkeepNeeded } = await raffle.callStatic.checkUpkeep([]);
                  assert.equal(raffleState.toString(), "1");
                  assert.equal(upkeepNeeded, false);
              });
              it("returns false if enough time hasn't passed", async () => {
                  await raffle.enterRaffle({ value: entranceFee });
                  await network.provider.send("evm_increaseTime", [interval.toNumber() - 5]); // use a higher number here if this test fails
                  await network.provider.request({ method: "evm_mine", params: [] });
                  const { upkeepNeeded } = await raffle.callStatic.checkUpkeep("0x"); // upkeepNeeded = (timePassed && isOpen && hasBalance && hasPlayers)
                  assert(!upkeepNeeded);
              });
              it("returns true if enough time has passed, has players, eth, and is open", async () => {
                  await raffle.enterRaffle({ value: entranceFee });
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1]);
                  await network.provider.request({ method: "evm_mine", params: [] });
                  const { upkeepNeeded } = await raffle.callStatic.checkUpkeep("0x"); // upkeepNeeded = (timePassed && isOpen && hasBalance && hasPlayers)
                  assert(upkeepNeeded);
              });
          });
          describe("performUpkeep", function () {
              it("Only execute if the checkUpkeep function is true", async function () {
                  await raffle.enterRaffle({ value: entranceFee });
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1]);
                  await network.provider.request({ method: "evm_mine", params: [] });
                  const tx = await raffle.performUpkeep("0x");
                  assert(tx);
              });

              it("reverts if checkUpkeep is false", async function () {
                  await expect(raffle.performUpkeep([])).to.be.revertedWith(
                      "Raffle__UpkeepNotNeeded"
                  );
              });

              it("updates the raffle state, emits an event and calls the vrfCoordinator contract", async function () {
                  await raffle.enterRaffle({ value: entranceFee });
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1]);
                  await network.provider.request({ method: "evm_mine", params: [] });
                  const txResponse = await raffle.performUpkeep("0x");
                  const txReceipt = await txResponse.wait(1);
                  const requestId = txReceipt.events[1].args.requestId;
                  const raffleState = await raffle.getRaffleState();
                  assert(raffleState == 1);
                  assert(requestId.toNumber() > 0);
              });
          });

          describe("fulfillRandomWords", async function () {
              beforeEach(async function () {
                  await raffle.enterRaffle({ value: entranceFee });
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1]);
                  await network.provider.request({ method: "evm_mine", params: [] });
              });
              it("can only be called after performUpkeep", async function () {
                  await expect(
                      vrfCoordinatorV2Mock.fulfillRandomWords(0, raffle.address)
                  ).to.be.revertedWith("nonexistent request");
                  await expect(
                      vrfCoordinatorV2Mock.fulfillRandomWords(1, raffle.address)
                  ).to.be.revertedWith("nonexistent request");
              });
              //This test simulates users entering the raffle and wraps the entire functionality of the raffle
              // inside a promise that will resolve if everything is successful.
              // An event listener for the WinnerPicked is set up
              // Mocks of chainlink automation and vrf coordinator are used to kickoff the winnerPicked event
              // All the assertions are done once the WinnerPicked event is fired
              it("picks a winner, resets the lottery and send the money", async function () {
                  const additionalEntrants = 3;
                  const startingAccountIndex = 1; // 0 is deployer
                  const accounts = await ethers.getSigners();
                  for (
                      i = startingAccountIndex;
                      i < startingAccountIndex + additionalEntrants;
                      i++
                  ) {
                      const accountConnectedRaffle = raffle.connect(accounts[i]);
                      await accountConnectedRaffle.enterRaffle({ value: entranceFee });
                  }
                  const startingTimestamp = await raffle.getLatestTimeStamp();
                  //In order to simulate for the fulfillRandomWords to be called we need to set up a listener
                  //so we don't want the test to end beforre the listener has finished listening so we create a promise to help
                  //listener finish listening

                  await new Promise(async (resolve, reject) => {
                      raffle.once("WinnerPicked", async () => {
                          console.log("Found the event!");
                          try {
                              const recentWinner = await raffle.getRecentWinner();
                              console.log(recentWinner);
                              console.log(accounts[0].address);
                              console.log(accounts[1].address);
                              console.log(accounts[2].address);

                              const numPlayers = await raffle.getNumberOfPlayers();
                              const recentTimeStamp = await raffle.getLatestTimeStamp();
                              const raffleState = await raffle.getRaffleState();
                              const winnerBalance = await accounts[1].getBalance();
                              assert.equal(numPlayers.toString(), "0");
                              assert(recentTimeStamp > startingTimestamp);
                              assert.equal(raffleState.toString(), "0");
                              assert.equal(
                                  winnerBalance.toString(),
                                  startingBalance
                                      .add(entranceFee.mul(additionalEntrants).add(entranceFee))
                                      .toString()
                              );
                          } catch (e) {
                              reject(e);
                          }
                          resolve();
                      });
                      const tx = await raffle.performUpkeep([]);
                      const txReceipt = await tx.wait(1);
                      await vrfCoordinatorV2Mock.fulfillRandomWords(
                          txReceipt.events[1].args.requestId,
                          raffle.address
                      );
                      const startingBalance = await accounts[1].getBalance();
                  });
              });
          });
      });
