const { ethers } = require("hardhat");
const fs = require("fs");

const FRONT_END_ADDRESSES_FILE = "../hardhat-lottery-frontend/constants/ContractAddresses.json";
const FRONT_END_ABI_FILE = "../hardhat-lottery-frontend/constants/ContractAbi.json";

module.exports = async () => {
    if (process.env.UPDATE_FRONT_END) {
        console.group("Updating Front End");
        updateContractAddresses();
        updateAbi();
    }
};

async function updateAbi() {
    const raffle = await ethers.getContract("Raffle");
    fs.writeFileSync(FRONT_END_ABI_FILE, raffle.interface.format(ethers.utils.FormatTypes.json)); //way to get the contract abi
}

async function updateContractAddresses() {
    const raffle = await ethers.getContract("Raffle");
    const currentAddresses = JSON.parse(fs.readFileSync(FRONT_END_ADDRESSES_FILE, "utf8"));
    const chainId = network.config.chainId.toString();

    if (chainId in currentAddresses) {
        if (!currentAddresses[chainId].includes(raffle.address)) {
            currentAddresses[chainId].push(raffle.address);
        }
    }
    {
        //if chainId doesn't even exist, we create a new array
        currentAddresses[chainId] = [raffle.address];
    }
    fs.writeFileSync(FRONT_END_ADDRESSES_FILE, JSON.stringify(currentAddresses));
}

module.exports.tags = ["all", "frontend"];
