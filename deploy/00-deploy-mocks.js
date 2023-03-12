const { network, ethers } = require("hardhat");
const { developmentChains } = require("../helper-hardhat-config");

const BASE_FEE = ethers.utils.parseEther("0.25");
const GAS_PRICE_LINK = 1e9; //calculated value based on the gas price of the chain which keeps on fluctuating

module.exports = async function ({ deployments, getNamedAccounts }) {
    const { deploy, log } = deployments;
    const { deployer } = await getNamedAccounts();
    //const chainId = network.config.chainId;

    if (developmentChains.includes(network.name)) {
        log("local network detected. Deploying Mocks...");
        await deploy("VRFCoordinatorV2Mock", {
            from: deployer,
            args: [BASE_FEE, GAS_PRICE_LINK],
            log: true,
        });
        log("Mocks deployed.");
        log("-------------------------------");
    }
};

module.exports.tags = ["mocks", "all"];
