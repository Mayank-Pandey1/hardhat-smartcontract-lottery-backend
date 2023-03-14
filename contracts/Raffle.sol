/*
    Raffle/Lottery contract:
    -> Players should be able to enter the raffle after paying an entrance fee
    -> Any random player should be choosen as winner
    -> Winner should be declared after every amount of interval

    -> We would need chainlink's VRF-V2 for randomness and chainlink keepers/Automation for declaring winner timely
*/

//SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "@chainlink/contracts/src/v0.8/VRFConsumerBaseV2.sol";
import "@chainlink/contracts/src/v0.8/interfaces/VRFCoordinatorV2Interface.sol";
import "@chainlink/contracts/src/v0.8/AutomationCompatible.sol";

error Raffle__NotEnoughETHEntered();
error Raffle__TransferFailed();
error Raffle__NotOpen();
error Raffle__UpkeepNotNeeded(uint256 balance, uint256 length, uint256 raffleState);

contract Raffle is VRFConsumerBaseV2, AutomationCompatible {
    enum RaffleState {
        OPEN,
        CALCULATING
    }

    //State Variables
    uint256 private immutable i_entranceFee;
    address payable[] private s_players;
    VRFCoordinatorV2Interface private immutable i_vrfCoordinator;
    bytes32 private immutable i_gasLane;
    uint64 private immutable i_subscriptionId;
    uint32 private immutable i_callbackGasLimit;
    uint16 private constant REQUEST_CONFIRMATIONS = 3;
    uint32 private constant NUM_WORDS = 1;

    //Lottery variables
    address private s_recentWinner;
    RaffleState private s_raffleState;
    uint256 private s_lastTimeStamp;
    uint256 private immutable i_interval;

    //Events
    event RaffleEnter(address indexed player);
    event RequestedRaffleWinner(uint256 requestId);
    event WinnerPicked(address indexed winner);

    //constructors
    constructor(
        address vrfCoordinatorV2,
        uint256 entranceFee,
        bytes32 gasLane,
        uint64 subscriptionId,
        uint32 callbackGasLimit,
        uint256 interval
    ) VRFConsumerBaseV2(vrfCoordinatorV2) {
        //Address of the contract that does the random number verification
        i_entranceFee = entranceFee;
        i_vrfCoordinator = VRFCoordinatorV2Interface(vrfCoordinatorV2); //Interface + address = contract
        i_gasLane = gasLane;
        i_subscriptionId = subscriptionId;
        i_callbackGasLimit = callbackGasLimit;
        s_raffleState = RaffleState.OPEN;
        s_lastTimeStamp = block.timestamp;
        i_interval = interval;
    }

    function enterRaffle() public payable {
        if (s_raffleState != RaffleState.OPEN) revert Raffle__NotOpen();
        if (msg.value < i_entranceFee) revert Raffle__NotEnoughETHEntered();

        s_players.push(payable(msg.sender));
        emit RaffleEnter(msg.sender);
    }

    /** @dev This is the function that the chainlink Automation nodes call. They look for the 'upkeepNeeded' function to
     * return true
     *The following should be true in order to return true
     * 1: The time interval should have passed
     * 2: There should be atleast one player in the lottery and have 1 ETH
     * 3: Our subscription is funded with link
     * 4: The lottery should be in OPEN state
     * */
    function checkUpkeep(
        bytes memory /*checkData*/
    ) public override returns (bool upkeepNeeded, bytes memory /*performData*/) {
        bool isOpen = (s_raffleState == RaffleState.OPEN);
        bool timePassed = ((block.timestamp - s_lastTimeStamp) > i_interval);
        bool hasPlayers = (s_players.length > 0);
        bool hasBalance = address(this).balance > 0;
        upkeepNeeded = (isOpen && timePassed && hasBalance && hasPlayers);
    }

    function performUpkeep(bytes calldata /* performData */) external override {
        //function present in vrfConsumerV2 contract
        (bool upkeepNeeded, ) = checkUpkeep("");
        if (!upkeepNeeded)
            revert Raffle__UpkeepNotNeeded(
                address(this).balance,
                s_players.length,
                uint256(s_raffleState)
            );
        s_raffleState = RaffleState.CALCULATING;
        uint256 requestId = i_vrfCoordinator.requestRandomWords( //calling the request function on the vrf coordinator contract
            i_gasLane,
            i_subscriptionId,
            REQUEST_CONFIRMATIONS,
            i_callbackGasLimit,
            NUM_WORDS
        );

        emit RequestedRaffleWinner(requestId);
    }

    function fulfillRandomWords(
        uint256 /*requestId*/,
        uint256[] memory randomWords
    ) internal override {
        uint256 indexOfWinner = randomWords[0] % s_players.length;
        address payable recentWinner = s_players[indexOfWinner];
        s_recentWinner = recentWinner;
        s_players = new address payable[](0);
        s_lastTimeStamp = block.timestamp;
        (bool success, ) = recentWinner.call{value: address(this).balance}(""); //sending money to the winner
        if (!success) {
            revert Raffle__TransferFailed();
        }
        emit WinnerPicked(recentWinner);
        s_raffleState = RaffleState.OPEN;
    }

    function getEntranceFee() public view returns (uint256) {
        return i_entranceFee;
    }

    function getPlayer(uint256 index) public view returns (address) {
        return s_players[index];
    }

    function getRecentWinner() public view returns (address) {
        return s_recentWinner;
    }

    function getNumWords() public pure returns (uint256) {
        return NUM_WORDS;
    }

    function getRaffleState() public view returns (RaffleState) {
        return s_raffleState;
    }

    function getLatestTimeStamp() public view returns (uint256) {
        return s_lastTimeStamp;
    }

    function getNumberOfPlayers() public view returns (uint256) {
        return s_players.length;
    }

    function getInterval() public view returns (uint256) {
        return i_interval;
    }
}
