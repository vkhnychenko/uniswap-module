import { ethers } from "ethers"
import abi from '@uniswap/v3-periphery/artifacts/contracts/SwapRouter.sol/SwapRouter.json' assert {type: 'json'}
import { getProvider, getWalletAddress, createWallet } from './providers.js'
import { MAX_FEE_PER_GAS, MAX_PRIORITY_FEE_PER_GAS, GAS_LIMIT, NETWORKS } from '../constants.js'
import {currentChainId, nativeToken, logger} from '../config.js'
import Web3 from 'web3';
import yesno from 'yesno'
import dotenv from 'dotenv'
dotenv.config()

const ROUTER_ADDRESS = '0xE592427A0AEce92De3Edee1F18E0157C05861564'
const WETH_ADDRESS = '0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6'
const UNI_ADDRESS = '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984'
const V3SwapRouterABI = abi

export async function swapEthForToken(tokenIn, tokenOut, amount){

    const address = getWalletAddress()
    const wallet = createWallet()
    const router = new ethers.Contract(
        ROUTER_ADDRESS,
        V3SwapRouterABI.abi
    )
    const inputAmount = ethers.utils.parseEther(amount.toString())
    const params = {
        tokenIn: tokenIn.address,
        tokenOut: tokenOut.address,
        fee: 300,
        recipient: address,
        deadline: Math.floor(Date.now() / 1000) + 60 * 20,
        amountIn: inputAmount,
        amountOutMinimum: 0,
        sqrtPriceLimitX96: 0
    }
    const data = router.interface.encodeFunctionData("exactInputSingle", [params])

    const transaction = {
        to: ROUTER_ADDRESS,
        from: address,
        data,
        value: inputAmount,
        gasLimit: GAS_LIMIT,
        maxFeePerGas: MAX_FEE_PER_GAS,
        maxPriorityFeePerGas: MAX_PRIORITY_FEE_PER_GAS,
    }

    logger.info(`rawTransaction: ${transaction}`)
    const tx = await wallet.sendTransaction(transaction);

    const resultTx = await tx.wait();
    logger.info(`resultTx: ${resultTx}`);
    logger.info(`txInfo: ${tx}`);
}

const broadcastApiUrl = 'https://tx-gateway.1inch.io/v1.1/' + currentChainId + '/broadcast';
const apiBaseUrl = 'https://api.1inch.io/v4.0/' + currentChainId;
const web3 = new Web3(NETWORKS[currentChainId].rpc);


export async function swapToken1Inch(tokenIn, tokenOut, amount, decimal){
    const wallet = createWallet()

    const swapParams = {
        fromTokenAddress: tokenIn,
        toTokenAddress: tokenOut,
        amount: (amount * 10 ** decimal).toFixed(),
        fromAddress: wallet.address,
        slippage: 1,
        disableEstimate: false,
        allowPartialFill: false,
    };
    
    logger.info('healthCheck status: ', await healthCheck());
    
    const allowance = await checkAllowance(swapParams.fromTokenAddress, wallet.address);
    
    logger.info('Allowance: ', allowance);
    if (tokenIn != nativeToken && allowance < amount){
        const transactionForSign = await buildTxForApproveTradeWithRouter(swapParams.fromTokenAddress);
        logger.info('Transaction for approve: ', transactionForSign);

        const approveTxHash = await signAndSendTransaction(wallet, transactionForSign);
        logger.info('Approve tx hash: ', approveTxHash)
    }
    
    
    const swapTransaction = await buildTxForSwap(swapParams);
    logger.info('Transaction for swap: ', swapTransaction);
    
    // const ok = await yesno({
    //     question: 'Do you want to send a transaction to exchange with 1inch router?'
    // });
    
    // // Before signing a transaction, make sure that all parameters in it are specified correctly
    // if (!ok) {
    //     return;
    // }
    
    // Send a transaction and get its hash
    const swapTxHash = await signAndSendTransaction(wallet, swapTransaction);
    logger.info('Swap transaction hash: ', swapTxHash);

}

function apiRequestUrl(methodName, queryParams) {
    return apiBaseUrl + methodName + '?' + (new URLSearchParams(queryParams)).toString();
}

async function checkAllowance(tokenAddress, walletAddress) {
    return fetch(apiRequestUrl('/approve/allowance', {tokenAddress, walletAddress}))
        .then(res => res.json())
        .then(res => res.allowance);
}

async function healthCheck() {
    return fetch(apiRequestUrl('/healthcheck'))
        .then(res => res.json())
        .then(res => res.status)
}

async function broadCastRawTransaction(rawTransaction) {
    return fetch(broadcastApiUrl, {
        method: 'post',
        body: JSON.stringify({rawTransaction}),
        headers: {'Content-Type': 'application/json'}
    })
    .then(res => res.json())
    .then(res => {
        return res.transactionHash;
    });
}

async function signAndSendTransaction(wallet, transaction) {
    logger.info(transaction)
    const {rawTransaction} = await web3.eth.accounts.signTransaction(transaction, process.env.WALLET_PRIVATE_KEY);
    
    // const ethersRawTransaction = await wallet.signTransaction({
    //     data: transaction.data,
    //     value: transaction.value,
    //     to: transaction.to,
    //     gasLimit: transaction.gas,
    //     gasLimit: 10 * 1000 * 1000,
    // })
    // logger.info('rawTransaction ethers', ethersRawTransaction)
    return await broadCastRawTransaction(rawTransaction);
}

async function buildTxForSwap(swapParams) {
    const url = apiRequestUrl('/swap', swapParams);

    return fetch(url).then(res => res.json()).then(res => res.tx);
}

async function buildTxForApproveTradeWithRouter(tokenAddress, amount) {
    const walletAddress = getWalletAddress()
    const url = apiRequestUrl(
        '/approve/transaction',
        amount ? {tokenAddress, amount} : {tokenAddress}
    );

    const transaction = await fetch(url).then(res => res.json());

    const gasLimit = await web3.eth.estimateGas({
        ...transaction,
        from: walletAddress
    });

    return {
        ...transaction,
        gas: gasLimit
    };
}