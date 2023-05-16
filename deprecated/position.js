import { CurrencyAmount, Percent, Token } from '@uniswap/sdk-core'
import {
  nearestUsableTick,
  NonfungiblePositionManager,
  Pool,
  Position,
} from '@uniswap/v3-sdk'
import { BigNumber, ethers } from 'ethers'
import { CurrentConfig, logger } from '../config.js'
import {
  ERC20_ABI,
  MAX_FEE_PER_GAS,
  MAX_PRIORITY_FEE_PER_GAS,
  NONFUNGIBLE_POSITION_MANAGER_ABI,
  NONFUNGIBLE_POSITION_MANAGER_CONTRACT_ADDRESS,
} from '../constants.js'
import { TOKEN_AMOUNT_TO_APPROVE_FOR_TRANSFER } from '../constants.js'
import { getPoolInfo } from './pool.js'
import { getProvider, sendTransaction, createWallet, getWalletAddress } from '../src/provider.js'

const wallet = createWallet()

export async function constructNewPosition(token0, token1, token0Amount, token1Amount) {
    const poolInfo = await getPoolInfo()
    const tickUpperMultiplier = process.env.TICK_UPPER_MULTIPLIER
    const tickLowerMultiplier = process.env.TICK_LOWER_MULTIPLIER

    const configuredPool = new Pool(
        token0,
        token1,
        poolInfo.fee,
        poolInfo.sqrtPriceX96.toString(),
        poolInfo.liquidity.toString(),
        poolInfo.tick
    )

    const tokenPrice1 = configuredPool.token0Price.toSignificant(10);
    logger.info(`tokenPrice1: ${tokenPrice1}`)
    const tokenPrice2 = configuredPool.token1Price.toSignificant(10);
    logger.info(`tokenPrice2: ${tokenPrice2}`)

//   create position using the maximum liquidity from input amounts
    const tickUpper = nearestUsableTick(poolInfo.tick, poolInfo.tickSpacing) + poolInfo.tickSpacing * tickUpperMultiplier
    logger.info(`tickUpper: ${tickUpper}`)

    const tickLower = nearestUsableTick(poolInfo.tick, poolInfo.tickSpacing) - poolInfo.tickSpacing * tickLowerMultiplier
    logger.info(`tickLower: ${tickLower}`)

    return Position.fromAmounts({
        pool: configuredPool,
        tickLower,
        tickUpper,
        amount0: token0Amount,
        amount1: token1Amount,
        useFullPrecision: true,
    })
}

export async function getCurrentPosition(token0, token1, poolInfo, positionInfo){

    // construct pool instance
    const configuredPool = new Pool(
        token0,
        token1,
        poolInfo.fee,
        poolInfo.sqrtPriceX96.toString(),
        poolInfo.liquidity.toString(),
        poolInfo.tick
    )

    // const tokenPrice0 = configuredPool.token0Price.toSignificant(10);
    // logger.info(`tokenPrice0: ${tokenPrice0}`)
    // const tokenPrice1 = configuredPool.token1Price.toSignificant(10);
    // logger.info(`tokenPrice1: ${tokenPrice1}`)

//   create position using the maximum liquidity from input amounts
    const { liquidity, tickLower, tickUpper } = positionInfo
    console.log(liquidity)
    return new Position({
        pool: configuredPool,
        liquidity,
        tickLower,
        tickUpper,
    })
}

export async function getPositionIds(){
    const provider = getProvider()
    const address = getWalletAddress()
    if (!provider || !address) {
        throw new Error('No provider available')
    }

    const positionContract = new ethers.Contract(
        NONFUNGIBLE_POSITION_MANAGER_CONTRACT_ADDRESS,
        NONFUNGIBLE_POSITION_MANAGER_ABI,
        provider
    )

    // Get number of positions
    const balance = await positionContract.balanceOf(address)

    // Get all positions
    const tokenIds = []
    for (let i = 0; i < balance; i++) {
        const tokenOfOwnerByIndex =
        await positionContract.tokenOfOwnerByIndex(address, i)
        tokenIds.push(tokenOfOwnerByIndex.toString())
    }

    return tokenIds
}

export async function getPositionInfo(tokenId) {
    const provider = getProvider()
    if (!provider) {
        throw new Error('No provider available')
    }

    const positionContract = new ethers.Contract(
        NONFUNGIBLE_POSITION_MANAGER_CONTRACT_ADDRESS,
        NONFUNGIBLE_POSITION_MANAGER_ABI,
        provider
    )

    const position = await positionContract.positions(tokenId)

    // logger.info('position', position)

    return {
        tickLower: position.tickLower,
        tickUpper: position.tickUpper,
        liquidity: position.liquidity.toString(),
        fee: position.fee,
        feeGrowthInside0LastX128: position.feeGrowthInside0LastX128.toString(),
        feeGrowthInside1LastX128: position.feeGrowthInside1LastX128.toString(),
        token0: position.token0,
        token1: position.token1,
        tokensOwed0: position.tokensOwed0.toString(),
        tokensOwed1: position.tokensOwed1.toString(),
    }
}

// async function getToken(address){
//     const tokenContract = new ethers.Contract(address, IERC20ABI, this.account.provider);

//     const tokenInfo = await Promise.all([tokenContract.decimals(), tokenContract.symbol(), tokenContract.name()]);

//     const token = new Token(network.chainId, address, tokenInfo[0], tokenInfo[1], tokenInfo[2]);

//     return token;
// }