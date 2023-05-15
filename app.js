import {TOKEN0, TOKEN1, FEE, logger} from './config.js'
import { ethers } from "ethers"
import {Uniswap} from './uniswap.js'
// import dotenv from 'dotenv'
// dotenv.config()

  
async function main(){

    logger.info('Start script')
    
    const uniswap = new Uniswap(TOKEN0, TOKEN1, FEE);

    const {balance0, balance1} = await uniswap.getTokenBalances()

    console.log(balance0)

    // await uniswap.checkAndRemovePosition()
    // await uniswap.prepareBalanceAndMintPosition()

    console.log(ethers.utils.formatUnits(balance0, uniswap.token0.decimals) - uniswap.token0minBalance)
}

main()