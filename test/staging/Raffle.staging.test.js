const { assert, expect } = require("chai");
const { network, getNamedAccounts, deployments, ethers } = require("hardhat");
const { developmentChains, networkConfig } = require("../../helper-hardhat-config");

developmentChains.includes(network.name)
    ? describe.skip
    : describe("Raffle Staging tests", function () {
          let raffle;
          let deployer;
          let entranceFee;

          beforeEach(async function () {
              deployer = (await getNamedAccounts()).deployer;
              raffle = await ethers.getContract("Raffle", deployer);
              entranceFee = await raffle.getEntranceFee();
          });
          describe("fulfillRandomWords", async function () {
              it("works with Live chainlink automation and vrf Coordinator, we get a random winner", async function () {
                  const startingTimestamp = await raffle.getLatestTimeStamp();
                  const accounts = await ethers.getSigners();
                  await new Promise(async (resolve, reject) => {
                      raffle.once("WinnerPicked", async () => {
                          console.log("Winner Picked, event fired.");

                          try {
                              const recentWinner = await raffle.getRecentWinner();
                              const raffleState = await raffle.getRaffleState();
                              const winnerEndingBalance = await accounts[0].getBalance();
                              const recentTimeStamp = await raffle.getLatestTimeStamp();

                              await expect(raffle.getPlayer(0)).to.be.reverted;
                              assert(recentTimeStamp > startingTimestamp);
                              assert.equal(raffleState, 0);
                              assert.equal(
                                  winnerEndingBalance.toString(),
                                  winnerStartingBalance.add(entranceFee).toString()
                              );
                              resolve();
                          } catch (error) {
                              console.log(error);
                              reject(e);
                          }
                      });
                  });
                  await raffle.enterRaffle({ value: entranceFee });
                  const winnerStartingBalance = await accounts[0].getBalance();
              });
          });
      });
