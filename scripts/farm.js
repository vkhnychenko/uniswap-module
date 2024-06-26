import { Uniswap } from '../src/uniswap.js'
import { TOKEN0, TOKEN1, FEE, logger } from '../config.js'
  
async function main(){

    logger.info('Start farm script')
    
    const uniswap = new Uniswap(TOKEN0, TOKEN1, FEE);
    await uniswap.checkAndRemovePosition()
    // await uniswap.prepareBalanceAndMintPosition()
    await uniswap.mintPositionAndAddLiquidity()
}

main()