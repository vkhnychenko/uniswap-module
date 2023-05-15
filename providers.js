import { ethers } from "ethers"
import {currentChainId} from './config.js'
import {NETWORKS} from './constants.js'
import dotenv from 'dotenv'
dotenv.config()

export function getProvider() {
    return new ethers.providers.StaticJsonRpcProvider(NETWORKS[currentChainId].rpc, {
        chainId: NETWORKS[currentChainId].chainId,
        name: NETWORKS[currentChainId].name
    }) 
}

export function createWallet() {
    return new ethers.Wallet(process.env.WALLET_PRIVATE_KEY, provider)
}

const provider = getProvider()
const wallet = createWallet()

export function getWalletAddress() {
    return wallet.address
}

export async function sendTransaction(transaction) {
    return sendTransactionViaWallet(transaction)
}

async function sendTransactionViaWallet(transaction) {
    if (transaction.value) {
        transaction.value = BigNumber.from(transaction.value)
    }
    const txRes = await wallet.sendTransaction(transaction)
    const provider = getProvider()

    let receipt = null
    if (!provider) {
        return 'Failed'
    }

    while (receipt === null) {
        try {
        receipt = await provider.getTransactionReceipt(txRes.hash)

        if (receipt === null) {
            continue
        }
        } catch (e) {
        logger.info(`Receipt error:`, e)
        break
        }
    }
  
    // Transaction was successful if status === 1
    if (receipt) {
        return 'Sent'
    } else {
        return 'Failed'
    }
}


