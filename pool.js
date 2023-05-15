import { ethers } from 'ethers'
import { CurrentConfig } from './config.js'
import IUniswapV3PoolABI from '@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Pool.sol/IUniswapV3Pool.json' assert { type: "json" }
import { POOL_FACTORY_CONTRACT_ADDRESS } from './constants.js'
import { getProvider } from './providers.js'
import { computePoolAddress } from '@uniswap/v3-sdk'

export async function getPoolInfo() {
    const provider = getProvider()
    if (!provider) {
        throw new Error('No provider')
    }

    const currentPoolAddress = computePoolAddress({
        factoryAddress: POOL_FACTORY_CONTRACT_ADDRESS,
        tokenA: CurrentConfig.tokens.token0,
        tokenB: CurrentConfig.tokens.token1,
        fee: CurrentConfig.tokens.poolFee,
    })

    const poolContract = new ethers.Contract(
        currentPoolAddress,
        IUniswapV3PoolABI.abi,
        provider
    )
    console.log('poolContractaddress', poolContract.address)
    const [token0, token1, fee, tickSpacing, liquidity, slot0] =
        await Promise.all([
        poolContract.token0(),
        poolContract.token1(),
        poolContract.fee(),
        poolContract.tickSpacing(),
        poolContract.liquidity(),
        poolContract.slot0(),
        ])

    return {
        token0,
        token1,
        fee,
        tickSpacing,
        liquidity,
        sqrtPriceX96: slot0[0],
        tick: slot0[1],
    }
}