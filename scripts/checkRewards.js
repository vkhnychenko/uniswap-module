import { Uniswap } from '../src/uniswap.js'
import { TOKEN0, TOKEN1, FEE, logger } from '../config.js'
  
async function main(){

    logger.info('Start check rewards')
    
    const uniswap = new Uniswap(TOKEN0, TOKEN1, FEE);
    const positionIds = await uniswap.getPositionIds(uniswap.connection.wallet.address)
    logger.info(`positions ids: ${positionIds}`)
    for (let positionId of positionIds) {
        const positionInfo = await uniswap.getPositionInfo(positionId);
    
        if (positionInfo.liquidity > 0){
            await uniswap.checkRewards(positionId)
        }
    }
}

main()