import { ethers } from "ethers"
import { NETWORKS } from "../constants.js"
import { sendMessageToTelegram } from "./telegramBot.js"
import { DEFAULT_GAS_LIMIT, logger } from "../config.js"

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

    async getNativeBalance(){
        const rawNativeBalance = await this.provider.getBalance(this.wallet.address)
        const nativeBalance = ethers.utils.formatEther(rawNativeBalance)
        logger.info(`native balance for address: ${this.wallet.address} - ${nativeBalance}`, )
        
        return {rawNativeBalance, nativeBalance}
    }

    // async getTokenInfo(tokenAddress){

    //     const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, this.provider)
    //     const tokenDecimals = await tokenContract.decimals()
    //     const tokenSymbol = await tokenContract.symbol()
    //     const rawTokenBalance = await tokenContract.balanceOf(this.wallet.address)
    //     const tokenBalance = ethers.utils.formatUnits(rawTokenBalance, tokenDecimals)
    //     logger.info(`${tokenSymbol} balance: ${tokenBalance} for address: ${this.wallet.address}`)
      
    //     return {tokenSymbol, tokenDecimals, rawTokenBalance, tokenBalance}
    // }

    async checkAvailableGas({gasPrice, gasLimit, value, chainName, transaction}){
        const {rawNativeBalance, nativeBalance} = await this.getNativeBalance()

        if (transaction){
            try{
                const estimateGas = await this.provider.estimateGas(transaction);
                console.log(`estimateGas: ${estimateGas}`)
            } catch(e){
                logger.error(`error while estimate gas ${e.message}`)
            }
            
        }
        
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
        const {lastBaseFeePerGas, maxFeePerGas, maxPriorityFeePerGas, gasPrice}  = await this.provider.getFeeData()
        const nonce =  await this.wallet.getTransactionCount()
        const gasLimit = txInfo.gasLimit ? txInfo.gasLimit : DEFAULT_GAS_LIMIT

        logger.info(`Start raw transaction for wallet: ${this.wallet.address} in network: ${chainName}, gas: ${gasPrice}, gasLimit: ${gasLimit} - nonce: ${nonce}`)
        

        const transaction = {
            from: this.wallet.address,
            gasLimit,
            gasPrice,
            nonce,
            // maxFeePerGas: this.maxFeePerGas,
            // maxPriorityFeePerGas: this.maxPriorityFeePerGas,
            ...txInfo
        }

        logger.info(`transaction: ${JSON.stringify(transaction)}`)

        // const gasAvailable = await this.checkAvailableGas({gasPrice, gasLimit: DEFAULT_GAS_LIMIT, value: txInfo.value, chainName, transaction})

        // if (!gasAvailable){
        //     return 0
        // }

        try {

            const tx = await this.wallet.sendTransaction(transaction);
            logger.info(`tx: ${JSON.stringify(tx)}`)
            const receipt = await tx.wait();
            logger.info(`receipt: ${JSON.stringify(receipt)}`);
            logger.info(`receipt status: ${receipt.status}`);
            return receipt.status

        } catch (e){
            logger.error(`Error while send transaction" ${e.message}`)
            await sendMessageToTelegram(`Ошибка при выполнении транзакции с параметрами ${JSON.stringify(transaction)} для адреса ${this.wallet.address} в сети ${chainName}`)
        }
    }

    async sendTransaction({ chainName, method, params, txInfo }){
        const {gasPrice}  = await this.provider.getFeeData()
        const nonce =  await this.wallet.getTransactionCount()
        const gasLimit = txInfo.gasLimit ? txInfo.gasLimit : DEFAULT_GAS_LIMIT

        logger.info(`Start transaction for wallet: ${this.wallet.address} in network: ${chainName}, gas: ${gasPrice}, gasLimit: ${gasLimit} - nonce: ${nonce}`)
        logger.info(...params)

        // const gasAvailable = await this.checkAvailableGas({gasPrice, gasLimit, value, chainName})

        // if (!gasAvailable){
        //     return 0
        // }

        const transaction = {
            from: this.wallet.address,
            gasLimit,
            gasPrice,
            // maxFeePerGas: this.maxFeePerGas,
            // maxPriorityFeePerGas: this.maxPriorityFeePerGas,
            nonce,
            ...txInfo
        }
        
        try{
            const tx = await method(...params, transaction)
            logger.info(`tx: ${JSON.stringify(tx)}`)
            const receipt = await tx.wait();
            logger.info(`receipt: ${JSON.stringify(receipt)}`);
            logger.info(`receipt status: ${receipt.status}`);
            return receipt.status
        } catch(e){
            logger.error(`Error while send transaction: ${e.message}`)
            await sendMessageToTelegram(`Ошибка при выполнении транзакции с параметрами ${params} для адреса ${this.wallet.address} в сети ${chainName}`)
        }
    }
}


