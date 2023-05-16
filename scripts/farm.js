import { ethers } from "ethers"
import { Uniswap } from '../src/uniswap.js'
import { TOKEN0, TOKEN1, FEE, logger } from '../config.js'
  
async function main(){

    
    console.log('Start farm')
    
    const uniswap = new Uniswap(TOKEN0, TOKEN1, FEE);
    // await uniswap.checkAndRemovePosition()
    await uniswap.prepareBalanceAndMintPosition()

    // const {balance0, balance1} = await uniswap.getTokenBalances()

    // console.log(balance0)

    // await uniswap.checkAndRemovePosition()
    // await uniswap.prepareBalanceAndMintPosition()

    // console.log(ethers.utils.formatUnits(balance0, uniswap.token0.decimals) - uniswap.token0minBalance)
}

main()