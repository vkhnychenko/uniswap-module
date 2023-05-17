// import { ethers } from "ethers"
// import {currentChainId} from './config.js'
// import {NETWORKS} from './constants.js'
// import dotenv from 'dotenv'
// dotenv.config()

// export function getProvider() {
//     return new ethers.providers.StaticJsonRpcProvider(NETWORKS[currentChainId].rpc, {
//         chainId: NETWORKS[currentChainId].chainId,
//         name: NETWORKS[currentChainId].name
//     }) 
// }

// export function createWallet() {
//     return new ethers.Wallet(process.env.WALLET_PRIVATE_KEY, provider)
// }

// const provider = getProvider()
// const wallet = createWallet()

// export function getWalletAddress() {
//     return wallet.address
// }

// export async function sendTransaction(transaction) {
//     return sendTransactionViaWallet(transaction)
// }

// async function sendTransactionViaWallet(transaction) {
//     if (transaction.value) {
//         transaction.value = BigNumber.from(transaction.value)
//     }
//     const txRes = await wallet.sendTransaction(transaction)
//     const provider = getProvider()

//     let receipt = null
//     if (!provider) {
//         return 'Failed'
//     }

//     while (receipt === null) {
//         try {
//         receipt = await provider.getTransactionReceipt(txRes.hash)

//         if (receipt === null) {
//             continue
//         }
//         } catch (e) {
//         logger.info(`Receipt error:`, e)
//         break
//         }
//     }
  
//     // Transaction was successful if status === 1
//     if (receipt) {
//         return 'Sent'
//     } else {
//         return 'Failed'
//     }
// }




import { ethers } from "ethers"
import { NETWORKS } from "../constants.js"
import { sendMessageToTelegram } from "./telegramBot.js"
import { GAS_LIMIT, logger } from "../config.js"


export class Connection {
    constructor(chainName, privateKey) {
        this.chainName = chainName
        this.privateKey = privateKey
        this.chain = NETWORKS[chainName]
    }

    get rpc(){
        return this.chain.rpc
    }

    get provider(){
        return new ethers.providers.StaticJsonRpcProvider(this.rpc) 
    }

    get wallet(){
        return new ethers.Wallet(this.privateKey, this.provider)
    }

    async getGasPrice(){
        const gasPrice = await this.provider.getGasPrice()
        logger.info('gasPrice', ethers.utils.formatUnits(gasPrice, 'gwei'))
        return gasPrice
    }

    async getNativeBalance(){
        const rawNativeBalance = await this.provider.getBalance(this.wallet.address)
        const nativeBalance = ethers.utils.formatEther(rawNativeBalance)
        logger.info(`native balance for address: ${this.wallet.address} - ${nativeBalance}`, )
        
        return {rawNativeBalance, nativeBalance}
    }

    async getTokenInfo(tokenAddress){

        const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, this.provider)
        const tokenDecimals = await tokenContract.decimals()
        const tokenSymbol = await tokenContract.symbol()
        const rawTokenBalance = await tokenContract.balanceOf(this.wallet.address)
        const tokenBalance = ethers.utils.formatUnits(rawTokenBalance, tokenDecimals)
        logger.info(`${tokenSymbol} balance: ${tokenBalance} for address: ${this.wallet.address}`)
      
        return {tokenSymbol, tokenDecimals, rawTokenBalance, tokenBalance}
    }

    async getNonce(){
        return await this.wallet.getTransactionCount()
    }

    async checkAvailableGas({gasPrice, gasLimit, value, chainName}){
        const {rawNativeBalance, nativeBalance} = await this.getNativeBalance()
        logger.info(`gasLimit: ${gasLimit}`)
        const needGas = gasPrice * gasLimit * 1.1 + +value
        logger.info(`raw native balance: ${+rawNativeBalance}`)
        logger.info(`needGas: ${needGas}`)
        if (+rawNativeBalance < needGas){
            logger.error('Gas not enough')
            await sendMessageToTelegram(`Недостаточно баланса для оплаты газа в сети ${chainName} для адреса ${this.wallet.address} - текущий баланс ${nativeBalance} - необходимо для транзакции: ${ethers.utils.formatEther(needGas)}`)
            return false
        }

        return true
    }

    async sendRawTransaction({txInfo, chainName}){
        const gasPrice = await this.getGasPrice()
        const nonce = await this.getNonce()

        logger.info(`Start raw transaction for wallet: ${this.wallet.address} in network: ${chainName}, gas: ${gasPrice}, gasLimit: ${GAS_LIMIT} - nonce: ${nonce}`)
        logger.info(`txInfo: ${JSON.stringify(txInfo)}`)

        const gasAvailable = await this.checkAvailableGas({gasPrice, gasLimit: GAS_LIMIT, value: txInfo.value, chainName})

        if (!gasAvailable){
            return 0
        }

        try {

            const tx = await this.wallet.sendTransaction({
                from: this.wallet.address,
                gasLimit: GAS_LIMIT,
                gasPrice,
                // maxFeePerGas: this.maxFeePerGas,
                // maxPriorityFeePerGas: this.maxPriorityFeePerGas,
                ...txInfo
            });
            logger.info(tx);
            const receipt = await tx.wait();
            logger.info(receipt);
            logger.info(`receipt status: ${receipt.status}`)
            return receipt.status

        } catch (e){
            logger.error(`Error while send transaction" ${e.message}`)
            await sendMessageToTelegram(`Ошибка при выполнении транзакции с параметрами ${txInfo} для адреса ${this.wallet.address} в сети ${chainName}`)
        }
    }

    async sendTransaction({ method, params, value, gasLimit, chainName }){
        const gasPrice = await this.getGasPrice()
        const nonce = await this.getNonce()

        logger.info(`Start transaction for wallet: ${this.wallet.address} in network: ${chainName}, gas: ${gasPrice}, gasLimit: ${gasLimit} - nonce: ${nonce}`)
        logger.info(...params)

        const gasAvailable = await this.checkAvailableGas({gasPrice, gasLimit, value, chainName})

        if (!gasAvailable){
            return 0
        }
        
        try{
            const tx = await method(...params, {
                from: this.wallet.address,
                value,
                //gasLimit,
                gasPrice,
                nonce,
                // maxFeePerGas: this.maxFeePerGas,
                // maxPriorityFeePerGas: this.maxPriorityFeePerGas,
            })
            logger.info(tx)
            const receipt = await tx.wait();
            logger.info(receipt);
            logger.info(`receipt status: ${receipt.status}`);
            return receipt.status
        } catch(e){
            logger.error(`Error while send transaction: ${e.message}`)
            await sendMessageToTelegram(`Ошибка при выполнении транзакции с параметрами ${params} для адреса ${this.wallet.address} в сети ${chainName}`)
        }
    }
}


