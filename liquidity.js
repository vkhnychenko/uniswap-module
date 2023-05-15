import { ERC20_ABI, MAX_FEE_PER_GAS, MAX_PRIORITY_FEE_PER_GAS, NONFUNGIBLE_POSITION_MANAGER_CONTRACT_ADDRESS, V3_SWAP_ROUTER_ADDRESS, getTokenInfo, GAS_LIMIT} from './constants.js'
import { ethers } from 'ethers'
import { NonfungiblePositionManager,  } from '@uniswap/v3-sdk'
import {
    nearestUsableTick,
    Pool,
    Position,
  } from '@uniswap/v3-sdk'
import { CurrentConfig, logger } from './config.js'
import { getProvider, getWalletAddress, createWallet } from './providers.js'
import { Percent, CurrencyAmount, Fraction } from '@uniswap/sdk-core'
import { constructNewPosition, getCurrentPosition, getPositionInfo } from './position.js'
import {AlphaRouter, SwapType} from '@uniswap/smart-order-router'
import dotenv from 'dotenv'
import { getPoolInfo } from './pool.js'

dotenv.config()

export async function removeLiquidity(positionId, poolInfo, positionInfo){
    const address = getWalletAddress()
    const provider = getProvider()
    const wallet = createWallet()
    if (!address || !provider) {
        return 'Failed'
    }

    logger.info(`remove Liquidity ${positionId}`)

    const token0 = getTokenInfo(positionInfo.token0)
    const token1 = getTokenInfo(positionInfo.token1)

    const currentPosition = await getCurrentPosition(token0, token1, poolInfo, positionInfo)

    const collectOptions = {
        expectedCurrencyOwed0: CurrencyAmount.fromRawAmount(token0, 0),
        expectedCurrencyOwed1: CurrencyAmount.fromRawAmount(token1, 0),
        recipient: address,
    }

    const removeLiquidityOptions = {
        deadline: Math.floor(Date.now() / 1000) + 60 * 20,
        slippageTolerance: new Percent(50, 10_000),
        tokenId: positionId,
        // percentage of liquidity to remove
        liquidityPercentage: new Percent(CurrentConfig.tokens.fractionToRemove),
        collectOptions,
    }
    // get calldata for minting a position
    const { calldata, value } = NonfungiblePositionManager.removeCallParameters(
        currentPosition,
        removeLiquidityOptions
    )

    const estimatedGas = await provider.estimateGas({
        to: NONFUNGIBLE_POSITION_MANAGER_CONTRACT_ADDRESS,
        data: calldata,
        value: value,
        from: address,
        maxFeePerGas: MAX_FEE_PER_GAS,
        maxPriorityFeePerGas: MAX_PRIORITY_FEE_PER_GAS
      });

    console.log(`estimatedGas: ${estimatedGas}`)

    // build transaction
    const transaction = {
        data: calldata,
        to: NONFUNGIBLE_POSITION_MANAGER_CONTRACT_ADDRESS,
        value: value.toString(),
        from: address,
        maxFeePerGas: MAX_FEE_PER_GAS,
        maxPriorityFeePerGas: MAX_PRIORITY_FEE_PER_GAS,
        gasLimit: estimatedGas,
    }

    const tx = await wallet.sendTransaction(transaction);
    logger.info('txInfo for remove liquidity', tx);

    const resultTx = await tx.wait();
    logger.info('resultTx for remove liquidity', resultTx);
    
}

export async function swapAndAddLiquidity(positionId, poolInfo, positionInfo, token0Amount, token1Amount){
    const address = getWalletAddress()
    const provider = getProvider()
    const wallet = createWallet()
    if (!address || !provider) {
        return 'Failed'
    }

    logger.info(`swap and add liquidity for positionId ${positionId}`)

    await getTokenTransferApproval(
        CurrentConfig.tokens.token0,
        V3_SWAP_ROUTER_ADDRESS,
        token0Amount
    )

    await getTokenTransferApproval(
        CurrentConfig.tokens.token1,
        V3_SWAP_ROUTER_ADDRESS,
        token1Amount
    )

    const router = new AlphaRouter({ chainId: CurrentConfig.tokens.token0.chainId, provider })

    const token0CurrencyAmount = CurrencyAmount.fromRawAmount(
        CurrentConfig.tokens.token0,
        ethers.utils.parseUnits(token0Amount, CurrentConfig.tokens.token0.decimals),
    )

    const token1CurrencyAmount = CurrencyAmount.fromRawAmount(
        CurrentConfig.tokens.token1,
        ethers.utils.parseUnits(token1Amount, CurrentConfig.tokens.token1.decimals)
    )

    const currentPosition = await getCurrentPosition(
        CurrentConfig.tokens.token0,
        CurrentConfig.tokens.token1,
        poolInfo,
        positionInfo
    )

    const swapAndAddConfig = {
        ratioErrorTolerance: new Fraction(1, 100),
        maxIterations: 6,
    }

    const swapAndAddOptions = {
        swapOptions: {
        type: SwapType.SWAP_ROUTER_02,
        recipient: address,
        slippageTolerance: new Percent(5, 100),
        deadline: Math.floor(Date.now() / 1000) + 60 * 20,
        },
        addLiquidityOptions: {
            tokenId: positionId,
        },
    }

    const routeToRatioResponse = await router.routeToRatio(
        token0CurrencyAmount,
        token1CurrencyAmount,
        currentPosition,
        swapAndAddConfig,
        swapAndAddOptions
    )

    if (
        !routeToRatioResponse ||
        routeToRatioResponse.status !== 1 // success
    ) {
        return 'Failed'
    }

    const route = routeToRatioResponse.result
    const transaction = {
        data: route.methodParameters?.calldata,
        to: V3_SWAP_ROUTER_ADDRESS,
        value: route.methodParameters?.value,
        from: address,
        gasLimit: GAS_LIMIT,
        maxFeePerGas: MAX_FEE_PER_GAS,
        maxPriorityFeePerGas: MAX_PRIORITY_FEE_PER_GAS,
    }

    const tx = await wallet.sendTransaction(transaction);
    logger.info(`txInfo for swap and add liquidity ${tx}`);

    const resultTx = await tx.wait();
    logger.info(`resultTx for swap and add liquidity: ${resultTx}`, );
    
}

export async function mintPosition(token0, token1, token0Amount, token1Amount) {
    const provider = getProvider()
    const wallet = createWallet()
    const address = getWalletAddress()

    if (!address || !provider) {
        return 'Failed'
    }
    logger.info(`Mint position token0Amount: ${token0Amount}, token1Amount: ${token1Amount}`)

    const tokenInApproval = await getTokenTransferApproval(
        token0,
        NONFUNGIBLE_POSITION_MANAGER_CONTRACT_ADDRESS,
        token0Amount
    )
    const tokenOutApproval = await getTokenTransferApproval(
        token1,
        NONFUNGIBLE_POSITION_MANAGER_CONTRACT_ADDRESS,
        token1Amount
    )
    console.log('amount', ethers.utils.parseUnits(token0Amount, token0.decimals))
    const positionToMint = await constructNewPosition(
        token0,
        token1,
        ethers.utils.parseUnits(token0Amount, token0.decimals),
        ethers.utils.parseUnits(token1Amount, token1.decimals)
    )

    const block = await provider.getBlock(provider.getBlockNumber());
    const mintOptions = {
        recipient: address,
        // deadline: Math.floor(Date.now() / 1000) + 60 * 20,
        slippageTolerance: new Percent(50, 10_000),
        deadline: block.timestamp + 200
    }

    // get calldata for minting a position
    const { calldata, value } = NonfungiblePositionManager.addCallParameters(
        positionToMint,
        mintOptions
    )

    console.log('calldata', calldata)
    console.log('value', value)
    console.log('mintOptions', mintOptions)
    console.log('positionToMint', positionToMint)

    // const estimatedGas = await provider.estimateGas({
    //     to: NONFUNGIBLE_POSITION_MANAGER_CONTRACT_ADDRESS,
    //     data: calldata,
    //     value: value,
    //     from: address
    //   });

    // console.log(`estimatedGas: ${estimatedGas}`)

    // build transaction
    const transaction = {
        data: calldata,
        to: NONFUNGIBLE_POSITION_MANAGER_CONTRACT_ADDRESS,
        value: value,
        from: address,
        gasLimit: GAS_LIMIT,
        maxFeePerGas: 200000000,
        maxPriorityFeePerGas: 0,
    }

    const tx = await wallet.sendTransaction(transaction);
    logger.info(`txInfo for mint position: ${tx}`);

    const resultTx = await tx.wait();

    logger.info(`resultTx for mint position ${resultTx}`); 
}

export async function addLiquidityInCurrentPosition(positionId, amount0, amount1){
    const address = getWalletAddress()
    const provider = getProvider()
    if (!address || !provider) {
      return 'Failed'
    }

    const poolInfo =  await getPoolInfo()
    console.log('poolInfo', poolInfo)
    const positionInfo = await getPositionInfo(positionId)

    const configuredPool = new Pool(
        CurrentConfig.tokens.token0,
        CurrentConfig.tokens.token1,
        poolInfo.fee,
        poolInfo.sqrtPriceX96.toString(),
        poolInfo.liquidity.toString(),
        poolInfo.tick
    )

    const { liquidity, tickLower, tickUpper } = positionInfo

    const newPosition = Position.fromAmounts({
        pool: configuredPool,
        liquidity,
        tickLower,
        tickUpper,
        amount0: ethers.utils.parseUnits(amount0, CurrentConfig.tokens.token0.decimals),
        amount1: ethers.utils.parseUnits(amount1, CurrentConfig.tokens.token1.decimals)
    })

    console.log('newPosition', newPosition)
    const addLiquidityOptions = {
      deadline: Math.floor(Date.now() / 1000) + 60 * 20,
      slippageTolerance: new Percent(50, 10_000),
      tokenId: positionId,
    }
  
    // get calldata for increasing a position
    const { calldata, value } = NonfungiblePositionManager.addCallParameters(
        newPosition,
        addLiquidityOptions
    )

    const estimatedGas = await provider.estimateGas({
        to: NONFUNGIBLE_POSITION_MANAGER_CONTRACT_ADDRESS,
        data: calldata,
        value: value,
        from: address
      });

    console.log(`estimatedGas: ${estimatedGas}`)
  
    // build transaction
    const transaction = {
      data: calldata,
      to: NONFUNGIBLE_POSITION_MANAGER_CONTRACT_ADDRESS,
      value: value,
      from: address,
      gasLimit: estimatedGas,
      maxFeePerGas: MAX_FEE_PER_GAS,
      maxPriorityFeePerGas: MAX_PRIORITY_FEE_PER_GAS,
    }
  
    const tx = await wallet.sendTransaction(transaction);
    console.log(`txInfo for mint position: ${tx}`);

    const resultTx = await tx.wait();

    console.log(`resultTx for mint position ${resultTx}`); 
}

async function getTokenTransferApproval(token, spender, amount){
    const provider = getProvider()
    const wallet = createWallet()
    const address = getWalletAddress()
    if (!provider || !address) {
        logger.error('No Provider Found')
        return 'Failed'
    }

    try {
        logger.info(`token transfer approval for token: ${token.address}`)
        const tokenContract = new ethers.Contract(
        token.address,
        ERC20_ABI,
        provider
        )

        let allowance = await tokenContract.allowance(address, spender)
        allowance = ethers.utils.formatEther(allowance)
        logger.info(`allowance: ${allowance} - amount: ${amount}`, )

        if (parseFloat(allowance) >= parseFloat(amount)){
            logger.info(`dont need allowance`)
            return
        }

        let transaction = await tokenContract.populateTransaction.approve(
        spender,
        ethers.utils.parseEther(amount.toString())
        )

        // const estimatedGas = await provider.estimateGas({
        //     data: transaction.data,
        //     value: transaction.value,
        //     to: NONFUNGIBLE_POSITION_MANAGER_CONTRACT_ADDRESS,
        //     from: address,
        //     gasLimit: GAS_LIMIT
        //   });
    
        // console.log(`estimatedGas: ${estimatedGas}`)

        transaction = {
            gasLimit: GAS_LIMIT,
            maxFeePerGas: MAX_FEE_PER_GAS,
            maxPriorityFeePerGas: MAX_PRIORITY_FEE_PER_GAS,
            from: address,
            ...transaction,
        }
        
        const tx = await wallet.sendTransaction(transaction);
        logger.info(`txInfo for token transfer approval: ${tx}`);

        const resultTx = await tx.wait();
        logger.info(`resultTx for token transfer approval: ${resultTx}`);
        
    } catch (e) {
        console.error(e)
        return 'Failed'
    }
}